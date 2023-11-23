import { PublicKey } from "@solana/web3.js";
import {
  PDAUtil,
  buildWhirlpoolClient,
  WhirlpoolIx,
  toTx,
} from "@renec/redex-sdk";
import {
  loadProvider,
  getTokenMintInfo,
  loadWallets,
  ROLES,
  getConfig,
} from "./utils";
import deployed from "./deployed.json";
import { getPoolInfo } from "./utils/pool";
import { BN } from "@project-serum/anchor";

const config = getConfig();

/**
 * @dev this file is used for testing
 * @usage yarn set_pool_discount_info <pool-index>
 */
async function main() {
  const poolIndex = parseInt(process.argv[2]);

  if (isNaN(poolIndex)) {
    console.error("Please provide a valid pool index.");
    return;
  }

  // fixed input
  const discountTokenMint = new PublicKey(config.DISCOUNT_TOKEN);
  const tokenConversionRate = 4000; // 10 Renec -> 6
  const discountFeeRate = 5000;
  const expo = 2;
  const discountTokenRateOverTokenA = new BN(2000000000); // 1 NSF = 2 token A

  const wallets = loadWallets([ROLES.POOL_CREATOR_AUTH]);
  const poolCreatorAuthKeypair = wallets[ROLES.POOL_CREATOR_AUTH];

  console.log("pool creator: ", poolCreatorAuthKeypair.publicKey.toString());

  const { ctx } = loadProvider(poolCreatorAuthKeypair);

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
          poolCreatorAuthority: poolCreatorAuthKeypair.publicKey,
          tokenConversionRate: tokenConversionRate,
          discountFeeRate: discountFeeRate,
          discountTokenRateOverTokenA: discountTokenRateOverTokenA,
          expo,
        });

        let tx = toTx(ctx, ix);
        const txHash = await tx.buildAndExecute();

        console.log("Tx hash: ", txHash);
        return;
      }
    } catch (e) {
      throw new Error("failed to get pool info: " + e);
    }
  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
