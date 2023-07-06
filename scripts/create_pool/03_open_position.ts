import { PublicKey } from "@solana/web3.js";
import {
  PDAUtil,
  buildWhirlpoolClient,
  PriceMath,
  increaseLiquidityQuoteByInputTokenWithParams,
} from "@renec/redex-sdk";
import { DecimalUtil, Percentage } from "@orca-so/common-sdk";
import { loadProvider, getTokenMintInfo, loadWallets } from "./utils";
import Decimal from "decimal.js";
import { askToConfirmPoolInfo, getPoolInfo } from "./utils/pool";
import { u64 } from "@solana/spl-token";
import { configEnv } from "../env.config";

async function main() {
  const wallets = loadWallets();

  if (!wallets.userKeypair) {
    throw new Error("Please provide user_wallet wallet");
  }

  const { ctx } = loadProvider(wallets.userKeypair);

  let REDEX_CONFIG_PUB: PublicKey;
  try {
    REDEX_CONFIG_PUB = new PublicKey(configEnv.REDEX_CONFIG_PUB);
  } catch (e) {
    console.log(
      "ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` ."
    );
    return;
  }
  const client = buildWhirlpoolClient(ctx);

  let poolInfo = getPoolInfo();
  await askToConfirmPoolInfo(poolInfo);
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

    if (whirlpool) {
      console.log("===================================================");
      const whirlpoolData = whirlpool.getData();
      const lowerPrice = new Decimal(poolInfo.lowerBPerAPrice);
      const upperPrice = new Decimal(poolInfo.upperBPerAPrice);
      const slippageTolerance = Percentage.fromDecimal(
        new Decimal(poolInfo.slippage)
      );

      console.log("input_mint:", poolInfo.inputMint);
      console.log("input_amount:", poolInfo.inputAmount);

      const tickLowerIndex = PriceMath.priceToInitializableTickIndex(
        lowerPrice,
        tokenMintA.decimals,
        tokenMintB.decimals,
        poolInfo.tickSpacing
      );
      const tickUpperIndex = PriceMath.priceToInitializableTickIndex(
        upperPrice,
        tokenMintA.decimals,
        tokenMintB.decimals,
        poolInfo.tickSpacing
      );

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

      const initTickTx = await whirlpool.initTickArrayForTicks([
        tickLowerIndex,
        tickUpperIndex,
      ]);

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
        tx.prependInstruction(initTickTx.compressIx(false));
      }
      const txid = await tx.buildAndExecute();
      console.log("open a new position at txid:", txid);
    }
  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
