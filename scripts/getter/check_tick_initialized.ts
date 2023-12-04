import { PublicKey } from "@solana/web3.js";
import {
  PDAUtil,
  buildWhirlpoolClient,
  PriceMath,
  TickArrayUtil,
} from "@renec/redex-sdk";

import { DecimalUtil, Percentage } from "@orca-so/common-sdk";
import {
  loadProvider,
  getTokenMintInfo,
  loadWallets,
  ROLES,
} from "../create_pool/utils";
import Decimal from "decimal.js";
import deployed from "../create_pool/deployed.json";
import { getPoolInfo } from "../create_pool/utils/pool";
import { getAllSurroundingTicksArrayInRange } from "../create_pool/utils/tickArrays";
import { u64 } from "@solana/spl-token";

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
      const tickSpacing = whirlpoolData.tickSpacing;
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
        poolInfo.tickSpacing
      );

      // Ensure that the lower and upper tick indices are included
      if (!allSurroundingTicksArray.includes(tickLowerIndex)) {
        allSurroundingTicksArray.unshift(tickLowerIndex); // Add to the start of the array
      }

      if (!allSurroundingTicksArray.includes(tickUpperIndex)) {
        allSurroundingTicksArray.push(tickUpperIndex); // Add to the end of the array
      }

      const uninitializedTickArrays =
        await TickArrayUtil.getUninitializedArraysPDAs(
          allSurroundingTicksArray,
          client.getContext().program.programId,
          whirlpool.getAddress(),
          tickSpacing,
          client.getFetcher(),
          true
        );

      // Filter out the uninitialized tick arrays to get the initialized ones
      const initializedTickArrays = allSurroundingTicksArray.filter(
        (tickIndex) =>
          !uninitializedTickArrays.some(
            (uninitPDA) => uninitPDA.startIndex === tickIndex
          )
      );
      initializedTickArrays.sort((a, b) => a - b);

      console.log("===================================================");
      console.log("current tick: ", whirlpoolData.tickCurrentIndex);
      console.log(
        "initialized tick array tick arrays: ",
        initializedTickArrays
      );
    }
  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
