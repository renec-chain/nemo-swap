import { PublicKey } from "@solana/web3.js";
import {
  Percentage,
  resolveOrCreateATAs,
  ZERO,
  TransactionBuilder,
} from "@orca-so/common-sdk";
import {
  PDAUtil,
  buildWhirlpoolClient,
  swapQuoteByInputToken,
  twoHopSwapQuoteFromSwapQuotes,
  WhirlpoolIx,
  PoolUtil,
  swapWithFeeDiscountQuoteByInputToken,
} from "@renec/redex-sdk";
import { loadProvider, loadWallets } from "../create_pool/utils";
import deployed from "../create_pool/deployed.json";
import { u64 } from "@solana/spl-token";
import { Wallet } from "@project-serum/anchor";

const TICK_SPACING = 32;

async function main() {
  // fixed params
  const renecPubkey = new PublicKey(
    "So11111111111111111111111111111111111111112"
  );
  const reusdPubkey = new PublicKey(
    "Afy8qEgeJykFziRwiCk6tnBbd3uzxMoEqn2GTNCyGN7P"
  );
  const revndPubkey = new PublicKey(
    "DSodi59U9ZWRnVgP94VNnKamFybYpsqYj2iKL1jQF7Ag"
  );

  const discountToken = new PublicKey(
    "33TX1A6V23ZAKfnCZvtSyvdKDfUDeLafVvRHCdGBp8xG"
  );

  // perform two hop swap
  const wallets = loadWallets();

  if (!wallets.userKeypair) {
    throw new Error("Please provide user_wallet wallet");
  }

  const sourceKeypair = wallets.userKeypair;
  const { ctx } = loadProvider(wallets.userKeypair);

  if (deployed.REDEX_CONFIG_PUB === "") {
    console.log(
      "ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` ."
    );
    return;
  }

  // Get pool info
  const pool1Tokens = PoolUtil.orderMints(renecPubkey, reusdPubkey);
  const pool2Tokens = PoolUtil.orderMints(reusdPubkey, revndPubkey);

  // Get whirlpool 1: renec - reusd
  const whirlpoolKey1 = PDAUtil.getWhirlpool(
    ctx.program.programId,
    new PublicKey(deployed.REDEX_CONFIG_PUB),
    new PublicKey(pool1Tokens[0].toString()),
    new PublicKey(pool1Tokens[1].toString()),
    TICK_SPACING
  ).publicKey;

  // get whirlpool 2: reusd - revnd
  const whirlpoolKey2 = PDAUtil.getWhirlpool(
    ctx.program.programId,
    new PublicKey(deployed.REDEX_CONFIG_PUB),
    new PublicKey(pool2Tokens[0].toString()),
    new PublicKey(pool2Tokens[1].toString()),
    TICK_SPACING
  ).publicKey;

  // Get quote to swap
  const client = buildWhirlpoolClient(ctx);
  const whirlpool1 = await client.getPool(whirlpoolKey1, true);
  const whirlpool2 = await client.getPool(whirlpoolKey2, true);

  const amount = new u64(100000);
  // renec is the input token
  const quote1 = await swapWithFeeDiscountQuoteByInputToken(
    whirlpool1,
    discountToken,
    renecPubkey,
    amount,
    Percentage.fromFraction(1, 100),
    ctx.program.programId,
    ctx.fetcher,
    true
  );

  // reusd is the intermediate token
  const quote2 = await swapWithFeeDiscountQuoteByInputToken(
    whirlpool2,
    discountToken,
    reusdPubkey,
    quote1.estimatedAmountOut,
    Percentage.fromFraction(1, 100),
    ctx.program.programId,
    ctx.fetcher,
    true
  );

  // two hop swap
  const tx = await client.twoHopSwapWithFeeDiscount(
    quote1,
    whirlpool1,
    quote2,
    whirlpool2,
    discountToken,
    new Wallet(sourceKeypair)
  );

  const txHash = await tx.buildAndExecute();
  console.log("txHash:", txHash);
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
