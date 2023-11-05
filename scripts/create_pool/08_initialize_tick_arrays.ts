import { PublicKey } from "@solana/web3.js";
import {
  PDAUtil,
  buildWhirlpoolClient,
  PriceMath,
  increaseLiquidityQuoteByInputTokenWithParams,
  Whirlpool,
  TickUtil,
  TICK_ARRAY_SIZE,
  TickArrayUtil,
  WhirlpoolClient,
  WhirlpoolContext,
} from "@renec/redex-sdk";

import { DecimalUtil, Percentage } from "@orca-so/common-sdk";
import {
  loadProvider,
  getTokenMintInfo,
  loadWallets,
  getConfig,
  ROLES,
} from "./utils";
import Decimal from "decimal.js";
import deployed from "./deployed.json";
import { getPoolInfo } from "./utils/pool";
import { u64 } from "@solana/spl-token";
import { TransactionBuilder, PDA } from "@orca-so/common-sdk";
import { initTickArrayIx } from "@renec/redex-sdk/dist/instructions";

const MAX_INIT_TICK_ARRAYS_IX = 5;

async function main() {
  let poolIndex = parseInt(process.argv[2]);

  if (isNaN(poolIndex)) {
    poolIndex = 0;
    console.error("Using default pool index 0");
  }

  const wallets = loadWallets([ROLES.USER]);
  const userKeypair = wallets[ROLES.USER];

  const { ctx } = loadProvider(userKeypair);

  if (deployed.REDEX_CONFIG_PUB === "") {
    console.log(
      "ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` ."
    );
    return;
  }

  const REDEX_CONFIG_PUB = new PublicKey(deployed.REDEX_CONFIG_PUB);
  const client = buildWhirlpoolClient(ctx);

  let poolInfo = getPoolInfo(poolIndex);
  const mintAPub = new PublicKey(poolInfo.tokenMintA);
  const mintBPub = new PublicKey(poolInfo.tokenMintB);
  const tokenMintA = await getTokenMintInfo(ctx, mintAPub);
  const tokenMintB = await getTokenMintInfo(ctx, mintBPub);

  if (tokenMintA && tokenMintB) {
    const whirlpoolPda = PDAUtil.getWhirlpool(
      ctx.program.programId,
      REDEX_CONFIG_PUB,
      mintAPub,
      mintBPub,
      poolInfo.tickSpacing
    );
    const whirlpool = await client.getPool(whirlpoolPda.publicKey);

    if (whirlpool && poolInfo.isOpenPosition) {
      console.log("===================================================");
      const whirlpoolData = whirlpool.getData();
      const lowerPrice = new Decimal(poolInfo.lowerBPerAPrice);
      const upperPrice = new Decimal(poolInfo.upperBPerAPrice);
      const slippageTolerance = Percentage.fromDecimal(
        new Decimal(poolInfo.slippage)
      );

      console.log("lower_b_per_a:", lowerPrice.toFixed(6));
      console.log("upper_b_per_a:", upperPrice.toFixed(6));
      console.log("slippage:", slippageTolerance.toString());
      console.log("input_mint:", poolInfo.inputMint);
      console.log("input_amount:", poolInfo.inputAmount);
      console.log("token mint A: ", mintAPub.toString());
      console.log("token mint B: ", mintBPub.toString());

      console.log("===================================================");

      const inputTokenMint = new PublicKey(poolInfo.inputMint);

      // Get correct input token amount
      let inputTokenAmount: u64;
      if (poolInfo.inputMint === mintAPub.toString()) {
        inputTokenAmount = DecimalUtil.toU64(
          new Decimal(poolInfo.inputAmount),
          tokenMintA.decimals
        );
      } else if (poolInfo.inputMint === mintBPub.toString()) {
        inputTokenAmount = DecimalUtil.toU64(
          new Decimal(poolInfo.inputAmount),
          tokenMintB.decimals
        );
      } else {
        throw new Error("Input token is not matched");
      }
      console.log("input token amount: ", inputTokenAmount.toString());

      // ================================================
      const { initTickTx, tickLowerIndex, tickUpperIndex } =
        await getInitializableTickArrays(
          client,
          whirlpool,
          lowerPrice,
          upperPrice
        );

      const quote = increaseLiquidityQuoteByInputTokenWithParams({
        tokenMintA: mintAPub,
        tokenMintB: mintBPub,
        sqrtPrice: whirlpoolData.sqrtPrice,
        tickCurrentIndex: whirlpoolData.tickCurrentIndex,
        tickLowerIndex,
        tickUpperIndex,
        inputTokenMint,
        inputTokenAmount,
        slippageTolerance,
      });

      console.log("quote: ", quote.liquidityAmount.toString());

      const { tx } = await whirlpool.openPosition(
        tickLowerIndex,
        tickUpperIndex,
        quote
      );
      if (initTickTx) {
        tx.prependInstruction(initTickTx.compressIx(false));
      }
      const txid = await tx.buildAndExecute();
      console.log("Tx hash:", txid);
    }
  }
}

const getInitializableTickArrays = async (
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

  const allSurroundingTicksArray = getallSurroundingTicksArrayInRange(
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

  // pick closet uninitalized tick array to the current tick due to tx size limit
  const surroundingUninitializedTickArrays =
    await getClosestUninitializedTickArray(
      client,
      whirlpool,
      allSurroundingTicksArray,
      tickSpacing,
      MAX_INIT_TICK_ARRAYS_IX - edgesUninitializedTickArrays.length
    );

  if (!surroundingUninitializedTickArrays.length) {
    return null;
  }

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

const getallSurroundingTicksArrayInRange = (
  tickLower: number,
  tickUpper: number,
  tickSpacing: number
): number[] => {
  const startTickLower = TickUtil.getStartTickIndex(tickLower, tickSpacing);
  const startTickUpper = TickUtil.getStartTickIndex(tickUpper, tickSpacing);

  // Get all start ticks in range
  const startTicks = [];
  const increment = TICK_ARRAY_SIZE * tickSpacing;
  // start tick lower and upper are exclusive
  for (let i = startTickLower + increment; i < startTickUpper; i += increment) {
    startTicks.push(i);
  }
  return startTicks;
};

const getClosestUninitializedTickArray = async (
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
    throw new Error("Cannot find the closest uninitialized tick array");
  }

  const leftAvailable = index; // Elements available to the left of the index
  const rightAvailable = initTickArrayStartPdas.length - index; // Elements available to the right of the index

  const leftCount = Math.floor(maxIxs / 2);
  const rightCount = maxIxs - leftCount;

  // Adjust if not enough elements on either side
  const actualLeftCount = Math.min(leftAvailable, leftCount);
  const actualRightCount = Math.min(rightAvailable, rightCount);

  const start = Math.max(index - actualLeftCount, 0);
  const end =
    Math.min(index + actualRightCount, initTickArrayStartPdas.length) - 1;

  if (!initTickArrayStartPdas.length) {
    return null;
  }

  return initTickArrayStartPdas.slice(start, end + 1);
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

  for (let i = 0; i < surroundingUninitializedTickArrays.length; i++) {
    console.log(
      "surroundingUninitializedTickArrays",
      surroundingUninitializedTickArrays[i].startIndex
    );
  }

  for (let i = 0; i < edgesUninitializedTickArrays.length; i++) {
    console.log(
      "edgesUninitializedTickArrays",
      edgesUninitializedTickArrays[i].startIndex
    );
  }

  surroundingUninitializedTickArrays.forEach((initTickArrayInfo) => {
    txBuilder.addInstruction(
      initTickArrayIx(context.program, {
        startTick: initTickArrayInfo.startIndex,
        tickArrayPda: initTickArrayInfo.pda,
        whirlpool: whirlpoolPubkey,
        funder: !!funder ? funder : provider.wallet.publicKey,
      })
    );
  });

  edgesUninitializedTickArrays.forEach((initTickArrayInfo) => {
    txBuilder.addInstruction(
      initTickArrayIx(context.program, {
        startTick: initTickArrayInfo.startIndex,
        tickArrayPda: initTickArrayInfo.pda,
        whirlpool: whirlpoolPubkey,
        funder: !!funder ? funder : provider.wallet.publicKey,
      })
    );
  });

  return txBuilder;
};

main().catch((reason) => {
  console.log("ERROR:", reason);
});
