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
import config from "./config.json";
import deployed from "./deployed.json";
import { askToConfirmPoolInfo, getPoolInfo } from "./utils/pool";

async function main() {
  const wallets = loadWallets();

  if (!wallets.userKeypair) {
    throw new Error("Please provide user_wallet wallet");
  }

  if (deployed.REDEX_CONFIG_PUB === "") {
    console.log(
      "ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` ."
    );
    return;
  }

  const { ctx } = loadProvider(wallets.userKeypair);

  const REDEX_CONFIG_PUB = new PublicKey(deployed.REDEX_CONFIG_PUB);
  const client = buildWhirlpoolClient(ctx);

  for (let i = 0; i < config.POOLS.length; i++) {
    let poolInfo = getPoolInfo(i);
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

      if (whirlpool && pool.OPEN_POSITION) {
        console.log("===================================================");
        const whirlpoolData = whirlpool.getData();
        const lowerPrice = new Decimal(pool.LOWER_B_PER_A_PRICE);
        const upperPrice = new Decimal(pool.UPPER_B_PER_A_PRICE);
        const slippageTolerance = Percentage.fromDecimal(
          new Decimal(pool.SLIPPAGE)
        );

        console.log("lower_b_per_a:", lowerPrice.toFixed(6));
        console.log("upper_b_per_a:", upperPrice.toFixed(6));
        console.log("slippage:", slippageTolerance.toString());
        console.log("input_mint:", pool.INPUT_MINT);
        console.log("input_amount:", pool.INPUT_AMOUNT);

        const tickLowerIndex = PriceMath.priceToInitializableTickIndex(
          lowerPrice,
          tokenMintA.decimals,
          tokenMintB.decimals,
          pool.TICK_SPACING
        );
        const tickUpperIndex = PriceMath.priceToInitializableTickIndex(
          upperPrice,
          tokenMintA.decimals,
          tokenMintB.decimals,
          pool.TICK_SPACING
        );

        const inputTokenMint = new PublicKey(pool.INPUT_MINT);
        const inputTokenAmount = DecimalUtil.toU64(
          new Decimal(pool.INPUT_AMOUNT),
          tokenMintA.decimals
        );

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
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
