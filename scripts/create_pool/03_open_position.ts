import { PublicKey } from "@solana/web3.js";
import {
  PDAUtil,
  buildWhirlpoolClient,
  increaseLiquidityQuoteByInputTokenWithParams,
} from "@renec/redex-sdk";

import { DecimalUtil, Percentage } from "@orca-so/common-sdk";
import { loadProvider, getTokenMintInfo, loadWallets, ROLES } from "./utils";
import Decimal from "decimal.js";
import deployed from "./deployed.json";
import { getPoolInfo } from "./utils/pool";
import { getInitializableTickArrays } from "./utils/tickArrays";
import { u64 } from "@solana/spl-token";
async function main() {
  let poolIndex = parseInt(process.argv[2]);

  if (isNaN(poolIndex)) {
    poolIndex = 0;
    console.error("Using default pool index 0");
  }

  const wallets = loadWallets([ROLES.USER]);
  const userKeypair = wallets[ROLES.USER];

  console.log("------------------");
  console.log("user wallet:", userKeypair.publicKey.toString());
  console.log("------------------");
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

  console.log("mint a pub: ", mintAPub.toString());
  console.log("mint b pub: ", mintBPub.toString());

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
      console.log("tick current index: ", whirlpoolData.tickCurrentIndex);

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

      const { tx } = await whirlpool.openPosition(
        tickLowerIndex,
        tickUpperIndex,
        quote
      );

      if (initTickTx) {
        tx.prependInstruction(initTickTx.compressIx(true));
      }

      const size = await tx.txnSize();
      console.log("size:", size);

      console.log("Tx size:", await tx.buildAndExecute());
    }
  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
