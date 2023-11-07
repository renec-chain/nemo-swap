import { PublicKey } from "@solana/web3.js";
import {
  PriceMath,
  Whirlpool,
  TickUtil,
  TICK_ARRAY_SIZE,
  TickArrayUtil,
  WhirlpoolClient,
  WhirlpoolContext,
} from "@renec/redex-sdk";

import { DecimalUtil, Percentage } from "@orca-so/common-sdk";
import Decimal from "decimal.js";
import { NATIVE_MINT, u64 } from "@solana/spl-token";
import { TransactionBuilder, PDA } from "@orca-so/common-sdk";
import { initTickArrayIx } from "@renec/redex-sdk/dist/instructions";

export const getInitializableTickArrays = async (
  client: WhirlpoolClient,
  whirlpool: Whirlpool,
  lowerPrice: Decimal,
  upperPrice: Decimal,
  funder?: PublicKey
): Promise<{
  initTickTx: TransactionBuilder;
  tickLowerIndex: number;
  tickUpperIndex: number;
}> => {
  const tokenMintA = whirlpool.getTokenAInfo();
  const tokenMintB = whirlpool.getTokenBInfo();
  const tickSpacing = whirlpool.getData().tickSpacing;

  const tickLowerIndex = PriceMath.priceToInitializableTickIndex(
    lowerPrice,
    tokenMintA.decimals,
    tokenMintB.decimals,
    tickSpacing
  );

  const tickUpperIndex = PriceMath.priceToInitializableTickIndex(
    upperPrice,
    tokenMintA.decimals,
    tokenMintB.decimals,
    tickSpacing
  );

  const allSurroundingTicksArray = getAllSurroundingTicksArrayInRange(
    tickLowerIndex,
    tickUpperIndex,
    tickSpacing
  );

  const edgesUninitializedTickArrays =
    await TickArrayUtil.getUninitializedArraysPDAs(
      [tickLowerIndex, tickUpperIndex],
      client.getContext().program.programId,
      whirlpool.getAddress(),
      tickSpacing,
      client.getFetcher(),
      true
    );

  const totalInitTickArraysIxs = calculateTotalNumberOfInitTickArrayIxs(
    whirlpool,
    2 - edgesUninitializedTickArrays.length
  );

  // pick closet uninitalized tick array to the current tick due to tx size limit
  const surroundingUninitializedTickArrays =
    await getClosestUninitializedTickArray(
      client,
      whirlpool,
      allSurroundingTicksArray,
      tickSpacing,
      totalInitTickArraysIxs - edgesUninitializedTickArrays.length
    );

  // Construct the init tick array tx
  const initTickTx = constructTheInitTickArrayTx(
    client.getContext(),
    whirlpool.getAddress(),
    surroundingUninitializedTickArrays,
    edgesUninitializedTickArrays,
    funder
  );

  return {
    initTickTx,
    tickLowerIndex,
    tickUpperIndex,
  };
};

export const getAllSurroundingTicksArrayInRange = (
  tickLower: number,
  tickUpper: number,
  tickSpacing: number
): number[] => {
  const startTickLower = TickUtil.getStartTickIndex(tickLower, tickSpacing);
  const startTickUpper = TickUtil.getStartTickIndex(tickUpper, tickSpacing);

  // Get all start ticks in range
  const startTicks: number[] = [];
  const increment = TICK_ARRAY_SIZE * tickSpacing;
  // start tick lower and upper are exclusive
  for (let i = startTickLower + increment; i < startTickUpper; i += increment) {
    startTicks.push(i);
  }
  return startTicks;
};

export const getClosestUninitializedTickArray = async (
  client: WhirlpoolClient,
  whirlpool: Whirlpool,
  allSurroundingTicksArray: number[],
  tickSpacing: number,
  maxIxs: number
): Promise<
  {
    startIndex: number;
    pda: PDA;
  }[]
> => {
  // Get all uninitialized ticks
  const initTickArrayStartPdas = await TickArrayUtil.getUninitializedArraysPDAs(
    allSurroundingTicksArray,
    client.getContext().program.programId,
    whirlpool.getAddress(),
    tickSpacing,
    client.getFetcher(),
    true
  );

  if (initTickArrayStartPdas.length <= maxIxs) {
    return initTickArrayStartPdas;
  }

  // sort ascending by start index
  initTickArrayStartPdas.sort((a, b) => a.startIndex - b.startIndex);
  const currentTickIndex = whirlpool.getData().tickCurrentIndex;

  // Get the start tick index that passes the current tick
  let index = -1;
  for (let i = 0; i < initTickArrayStartPdas.length; i++) {
    if (currentTickIndex < initTickArrayStartPdas[i].startIndex) {
      index = i;
      break;
    } else if (currentTickIndex === initTickArrayStartPdas[i].startIndex) {
      index = i + 1; // index of the next tick array
      break;
    }
  }

  if (index === -1 || index >= initTickArrayStartPdas.length) {
    return []; // no tick arrrays need to be initialized
  }

  // Distribute uninitializedIxs surrounding the current tick. Take left first
  let availableIxs = maxIxs;
  let maxLeft = index - 1;
  let maxRight = index;
  let pickFromLeft = true;

  const resultIndices: number[] = [];
  while (
    availableIxs > 0 &&
    (maxLeft >= 0 || maxRight < initTickArrayStartPdas.length)
  ) {
    if (pickFromLeft && availableIxs > 0 && maxLeft >= 0) {
      resultIndices.push(maxLeft);
      maxLeft--;
      availableIxs--;
    } else if (
      !pickFromLeft &&
      availableIxs > 0 &&
      maxRight < initTickArrayStartPdas.length
    ) {
      resultIndices.push(maxRight);
      maxRight++;
      availableIxs--;
    }

    pickFromLeft = !pickFromLeft;
  }
  const selectedPDAs = resultIndices.map(
    (index) => initTickArrayStartPdas[index]
  );

  return selectedPDAs;
};

const constructTheInitTickArrayTx = (
  context: WhirlpoolContext,
  whirlpoolPubkey: PublicKey,
  surroundingUninitializedTickArrays: {
    startIndex: number;
    pda: PDA;
  }[],
  edgesUninitializedTickArrays: {
    startIndex: number;
    pda: PDA;
  }[],
  funder?: PublicKey
): TransactionBuilder => {
  const provider = context.provider;
  const program = context.program;
  const txBuilder = new TransactionBuilder(
    provider.connection,
    provider.wallet
  );

  console.log("------------------Init Tick Array------------------");
  const startIndexArray = surroundingUninitializedTickArrays
    .map((tickArray) => tickArray.startIndex)
    .sort((a, b) => a - b); // Sort numerically in ascending order

  console.log(
    "Surrounding Uninitialized Tick Arrays Start Indices:",
    startIndexArray
  );

  const edgesStartIndexArray = edgesUninitializedTickArrays
    .map((tickArray) => tickArray.startIndex)
    .sort((a, b) => a - b); // Sort numerically in ascending order

  console.log(
    "Edges Uninitialized Tick Arrays Start Indices:",
    edgesStartIndexArray
  );
  console.log("---------------------------------------------------");

  surroundingUninitializedTickArrays.forEach((initTickArrayInfo) => {
    txBuilder.addInstruction(
      initTickArrayIx(program, {
        startTick: initTickArrayInfo.startIndex,
        tickArrayPda: initTickArrayInfo.pda,
        whirlpool: whirlpoolPubkey,
        funder: !!funder ? funder : provider.wallet.publicKey,
      })
    );
  });

  edgesUninitializedTickArrays.forEach((initTickArrayInfo) => {
    txBuilder.addInstruction(
      initTickArrayIx(program, {
        startTick: initTickArrayInfo.startIndex,
        tickArrayPda: initTickArrayInfo.pda,
        whirlpool: whirlpoolPubkey,
        funder: !!funder ? funder : provider.wallet.publicKey,
      })
    );
  });

  return txBuilder;
};

// Do this, since the simulate to calculation the tx size is slow
export const calculateTotalNumberOfInitTickArrayIxs = (
  whirlpool: Whirlpool,
  numOfEdgesArrayInitialized: number
) => {
  if (numOfEdgesArrayInitialized < 0) {
    throw new Error("numOfEdgesArrayInitialized cannot be negative");
  }

  const txSizeLimit = 1232;
  const addtionalCostOfNotInitTickAtEdge = 32;
  const bytesPerTickArrayIx = 51;

  type NumTickArray = {
    numOfTickArrays: number;
    txSize: number;
  };

  const tokenAndToken: NumTickArray = {
    numOfTickArrays: 10,
    txSize: 1208,
  };
  const tokenAndRenec: NumTickArray = {
    numOfTickArrays: 7,
    txSize: 1223,
  };

  let numTickArray: NumTickArray;
  if (isWhirlpoolContainRenec(whirlpool)) {
    numTickArray = tokenAndRenec;
  } else {
    numTickArray = tokenAndToken;
  }

  // For one edge initialzed, cost more 32 bytes. For a numOfTickArrays left, cost less 51 bytes
  numTickArray.txSize =
    numTickArray.txSize +
    addtionalCostOfNotInitTickAtEdge * numOfEdgesArrayInitialized;
  while (numTickArray.txSize > txSizeLimit) {
    numTickArray.numOfTickArrays--;
    numTickArray.txSize = numTickArray.txSize - bytesPerTickArrayIx;
  }

  console.log("numOfTickArrays: ", numTickArray);
  return numTickArray.numOfTickArrays;
};

const isWhirlpoolContainRenec = (whirlpool: Whirlpool): boolean => {
  const tokenMintA = whirlpool.getData().tokenMintA;
  const tokenMintB = whirlpool.getData().tokenMintB;
  return tokenMintA.equals(NATIVE_MINT) || tokenMintB.equals(NATIVE_MINT);
};
