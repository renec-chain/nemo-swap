import { PublicKey } from "@solana/web3.js";
import { PDAUtil, buildWhirlpoolClient, PriceMath } from "@renec/redex-sdk";
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

async function main() {
  let poolIndex = parseInt(process.argv[2]);

  if (isNaN(poolIndex)) {
    poolIndex = 0;
    console.error("Using default pool index 0");
  }

  const wallets = loadWallets([ROLES.POOL_CREATOR_AUTH, ROLES.USER]);
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

  // Get pool info
  let poolInfo = getPoolInfo(poolIndex);

  const mintAPub = new PublicKey(poolInfo.tokenMintA);
  const mintBPub = new PublicKey(poolInfo.tokenMintB);
  const tokenMintA = await getTokenMintInfo(ctx, mintAPub);
  const tokenMintB = await getTokenMintInfo(ctx, mintBPub);

  if (tokenMintA && tokenMintB) {
    console.log("===================================================");
    console.log("token_a:", mintAPub.toBase58());
    console.log("token_b:", mintBPub.toBase58());
    console.log("tick_spacing:", poolInfo.tickSpacing);
    console.log("tick_spacing:", poolInfo.tokenMintB);

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
        console.log("fee_rate: ", whirlpool.getData().feeRate);

        return;
      }
    } catch (e) {
      // This pool not existed
    }
    console.log("deploying new pool...");

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
    console.log(
      `new pool account ${poolKey.toString()} deployed at txid:`,
      txid
    );
  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
