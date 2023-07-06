import { PublicKey } from "@solana/web3.js";
import {
  PDAUtil,
  buildWhirlpoolClient,
  PriceMath,
  AccountFetcher,
} from "@renec/redex-sdk";
import { loadProvider, getTokenMintInfo, loadWallets } from "./utils";
import Decimal from "decimal.js";
import { configEnv } from "../env.config";
import { askToConfirmPoolInfo, getPoolInfo } from "./utils/pool";

async function main() {
  const wallets = loadWallets();

  if (!wallets.poolCreatorAuthKeypair) {
    throw new Error("Please provide pool_creator_authority_wallet wallet");
  }

  const { ctx } = loadProvider(wallets.poolCreatorAuthKeypair);

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
    console.log("===================================================");
    console.log("token_a:", mintAPub.toBase58());
    console.log("token_b:", mintBPub.toBase58());
    console.log("tick_spacing:", poolInfo.tickSpacing);

    const whirlpoolPda = PDAUtil.getWhirlpool(
      ctx.program.programId,
      REDEX_CONFIG_PUB,
      mintAPub,
      mintBPub,
      poolInfo.tickSpacing
    );

    try {
      const whirlpool = await client.getPool(whirlpoolPda.publicKey);
      if (whirlpool) {
        const price = PriceMath.sqrtPriceX64ToPrice(
          whirlpool.getData().sqrtPrice,
          tokenMintA.decimals,
          tokenMintB.decimals
        );
        console.log("price_b_per_a:", price.toFixed(6));
        console.log("pool_pub:", whirlpoolPda.publicKey.toBase58());
        return;
      }
    } catch (e) {
      console.log("deploying new pool...");
    }

    const currentA2BPrice = new Decimal(poolInfo.initialAmountBPerA);
    const tickIndex = PriceMath.priceToInitializableTickIndex(
      currentA2BPrice,
      tokenMintA.decimals,
      tokenMintB.decimals,
      poolInfo.tickSpacing
    );
    const { poolKey, tx } = await client.createPool(
      REDEX_CONFIG_PUB,
      poolInfo.tokenMintA,
      poolInfo.tokenMintB,
      poolInfo.tickSpacing,
      tickIndex,
      ctx.wallet.publicKey
    );
    const txid = await tx.buildAndExecute();
    console.log("new pool account deployed at txid:", txid);

    await showPoolInfo(ctx.fetcher, poolKey);
  } else {
    console.log(
      "Token Mint A or Token Mint B is not found. Please check the token mint address."
    );
  }
}

async function showPoolInfo(fetcher: AccountFetcher, poolKey: PublicKey) {
  await fetcher.refreshAll();

  const pool = await fetcher.getPool(poolKey);

  if (!pool) {
    console.log(
      "\x1b[31m%s\x1b[0m",
      `Cannot find pool info at address: ${poolKey.toBase58()}`
    );
  } else {
    console.log("===================================================");
    console.log("\x1b[32m%s\x1b[0m", `public_key: ${poolKey.toBase58()}`);

    console.log("pool config:", pool.whirlpoolsConfig.toString());
    console.log("token_a:", pool.tokenMintA.toString());
    console.log("token_b:", pool.tokenMintB.toString());
    console.log("tick_spacing:", pool.tickSpacing.toString());
  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
