import { PublicKey } from "@solana/web3.js";
import { Percentage } from "@orca-so/common-sdk";
import {
  PDAUtil,
  buildWhirlpoolClient,
  PoolUtil,
  swapWithFeeDiscountQuoteByInputToken,
} from "@renec/redex-sdk";
import { ROLES, loadProvider, loadWallets } from "../create_pool/utils";
import deployed from "../create_pool/deployed.json";
import { u64 } from "@solana/spl-token";
import { Wallet } from "@project-serum/anchor";
import { getTwoHopSwapTokens } from "./utils";
import { getPoolInfo } from "../create_pool/utils/pool";

const TICK_SPACING = 32;

async function main() {
  const poolIndex1 = parseInt(process.argv[2]);
  const poolIndex2 = parseInt(process.argv[3]);

  if (isNaN(poolIndex1) || isNaN(poolIndex2)) {
    console.error("Please provide two valid pool indexes.");
    return;
  }

  let poolInfo1 = getPoolInfo(poolIndex1);
  let poolInfo2 = getPoolInfo(poolIndex2);

  const wallets = loadWallets([ROLES.USER]);
  const userKeypair = wallets[ROLES.USER];

  const { ctx } = loadProvider(userKeypair);

  if (deployed.REDEX_CONFIG_PUB === "") {
    console.log(
      "ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` ."
    );
    return;
  }

  // Get whirlpool 1: renec - reusd
  const whirlpoolKey1 = PDAUtil.getWhirlpool(
    ctx.program.programId,
    new PublicKey(deployed.REDEX_CONFIG_PUB),
    new PublicKey(poolInfo1.tokenMintA),
    new PublicKey(poolInfo1.tokenMintB),
    TICK_SPACING
  ).publicKey;

  // get whirlpool 2: reusd - revnd
  const whirlpoolKey2 = PDAUtil.getWhirlpool(
    ctx.program.programId,
    new PublicKey(deployed.REDEX_CONFIG_PUB),
    new PublicKey(poolInfo2.tokenMintA),
    new PublicKey(poolInfo2.tokenMintB),
    TICK_SPACING
  ).publicKey;

  // Get quote to swap
  const client = buildWhirlpoolClient(ctx);
  const whirlpool1 = await client.getPool(whirlpoolKey1, true);
  const whirlpool2 = await client.getPool(whirlpoolKey2, true);

  const twoHopsTokens = getTwoHopSwapTokens(whirlpool1, whirlpool2);

  const amount = new u64(900);
  const discountToken = new PublicKey(poolInfo1.discountTokenMint);

  // renec is the input token
  const quote1 = await swapWithFeeDiscountQuoteByInputToken(
    whirlpool1,
    discountToken,
    twoHopsTokens.pool1OtherToken,
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
    twoHopsTokens.intermidaryToken,
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
    new Wallet(userKeypair)
  );

  const txHash = await tx.tx.buildAndExecute();
  console.log("txHash:", txHash);
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
