import { PublicKey } from "@solana/web3.js";
import {
  PDAUtil,
  buildWhirlpoolClient,
  PriceMath,
  WhirlpoolIx,
  toTx,
} from "@renec/redex-sdk";
import { loadProvider, getTokenMintInfo, loadWallets } from "./utils";
import Decimal from "decimal.js";
import config from "./config.json";
import deployed from "./deployed.json";
import { askToConfirmPoolInfo, getPoolInfo } from "./utils/pool";
import { BN } from "@project-serum/anchor";

async function main() {
  const wallets = loadWallets();

  if (!wallets.poolCreatorAuthKeypair) {
    throw new Error("Please provide pool_creator_authority_wallet wallet");
  }
  console.log(
    "pool creator: ",
    wallets.poolCreatorAuthKeypair.publicKey.toString()
  );

  const { ctx } = loadProvider(wallets.poolCreatorAuthKeypair);

  if (deployed.REDEX_CONFIG_PUB === "") {
    console.log(
      "ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` ."
    );
    return;
  }

  // fixed input
  const discountTokenMint = new PublicKey(
    "4VH7LAZr9RCj5CWofpnykM6f3URa2KuhdcCjbitmLViE"
  );
  const tokenConversionRate = 4000;
  const discountFeeRate = 5000;
  const discountTokenRateOverTokenA = new BN(2000000000); // 1 NSF = 2 token A

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
      console.log("===================================================");
      console.log("token_a:", mintAPub.toBase58());
      console.log("token_b:", mintBPub.toBase58());

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
          const whirlpoolDiscountInfoPDA = PDAUtil.getWhirlpoolDiscountInfo(
            ctx.program.programId,
            whirlpool.getAddress(),
            discountTokenMint
          );

          const whirlpoolData = await whirlpool.refreshData();
          const ix = WhirlpoolIx.initializePoolDiscountInfoIx(ctx.program, {
            whirlpoolsConfig: whirlpoolData.whirlpoolsConfig,
            whirlpool: whirlpool.getAddress(),
            discountToken: discountTokenMint,
            whirlpoolDiscountInfoPDA,
            poolCreatorAuthority: wallets.poolCreatorAuthKeypair.publicKey,
            tokenConversionRate: tokenConversionRate,
            discountFeeRate: discountFeeRate,
            discountTokenRateOverTokenA: discountTokenRateOverTokenA,
          });

          let tx = toTx(ctx, ix);
          const txHash = await tx.buildAndExecute();

          console.log("Tx hash: ", txHash);
          return;
        }
      } catch (e) {
        throw new Error("failed to get pool info");
      }
    }
  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
