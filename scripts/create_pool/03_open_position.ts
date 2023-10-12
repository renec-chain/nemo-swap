import { PublicKey } from "@solana/web3.js";
import {
  PDAUtil,
  buildWhirlpoolClient,
  PriceMath,
  increaseLiquidityQuoteByInputTokenWithParams,
} from "@renec/redex-sdk";
import { DecimalUtil, Percentage } from "@orca-so/common-sdk";
import { loadProvider, getTokenMintInfo, loadWallets, ROLES } from "./utils";
import Decimal from "decimal.js";
import config from "./config.json";
import deployed from "./deployed.json";
import { askToConfirmPoolInfo, getPoolInfo } from "./utils/pool";
import { u64 } from "@solana/spl-token";

async function main() {
  const wallets = loadWallets([ROLES.USER]);
  const userKeypair = wallets[ROLES.USER];

  if (deployed.REDEX_CONFIG_PUB === "") {
    console.log(
      "ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` ."
    );
    return;
  }

  const { ctx } = loadProvider(userKeypair);

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

        const tickLowerIndex = PriceMath.priceToInitializableTickIndex(
          lowerPrice,
          tokenMintA.decimals,
          tokenMintB.decimals,
          poolInfo.tickSpacing
        );
        console.log("tick lower index: ", tickLowerIndex);
        const tickUpperIndex = PriceMath.priceToInitializableTickIndex(
          upperPrice,
          tokenMintA.decimals,
          tokenMintB.decimals,
          poolInfo.tickSpacing
        );

        console.log("tick upper index: ", tickUpperIndex);

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
        console.log("input token amount: ", inputTokenAmount.toString());
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
        console.log("open a new position at txid:", txid);
      }
    }
  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
