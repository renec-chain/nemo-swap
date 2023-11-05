import { PublicKey } from "@solana/web3.js";
import {
  PDAUtil,
  buildWhirlpoolClient,
  PriceMath,
  increaseLiquidityQuoteByInputTokenWithParams,
  Whirlpool,
  TickUtil,
  TICK_ARRAY_SIZE,
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

      getInitializableTickArrays(whirlpool, lowerPrice, upperPrice);
    }
  }
}

const getInitializableTickArrays = async (
  whirlpool: Whirlpool,
  lowerPrice: Decimal,
  upperPrice: Decimal
) => {
  // Get current tick
  const price = whirlpool.getData().sqrtPrice;
  const currentTick = PriceMath.sqrtPriceX64ToTickIndex(price);

  getAllStartTicksInRange(whirlpool, lowerPrice, upperPrice);
};

const getAllStartTicksInRange = (
  whirlpool: Whirlpool,
  lowerPrice: Decimal,
  upperPrice: Decimal
) => {
  const tokenMintA = whirlpool.getTokenAInfo();
  const tokenMintB = whirlpool.getTokenBInfo();
  const tickSpacing = whirlpool.getData().tickSpacing;

  const tickLower = PriceMath.priceToInitializableTickIndex(
    lowerPrice,
    tokenMintA.decimals,
    tokenMintB.decimals,
    tickSpacing
  );

  const tickUpper = PriceMath.priceToInitializableTickIndex(
    upperPrice,
    tokenMintA.decimals,
    tokenMintB.decimals,
    tickSpacing
  );

  const startTickLower = TickUtil.getStartTickIndex(tickLower, tickSpacing);
  const startTickUpper = TickUtil.getStartTickIndex(tickUpper, tickSpacing);

  // Get all start ticks in range
  const startTicks = [];
  const increment = TICK_ARRAY_SIZE * tickSpacing;
  for (let i = startTickLower; i <= startTickUpper; i += increment) {
    startTicks.push(i);
  }
  return startTicks;
};

main().catch((reason) => {
  console.log("ERROR:", reason);
});
