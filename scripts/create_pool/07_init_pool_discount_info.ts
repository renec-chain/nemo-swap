import { PublicKey } from "@solana/web3.js";
import {
  PDAUtil,
  buildWhirlpoolClient,
  WhirlpoolIx,
  toTx,
} from "@renec/redex-sdk";
import { getRateOverToken } from "@renec/redex-sdk/src/impl/util";
import { loadProvider, getTokenMintInfo, loadWallets } from "./utils";
import config from "./config.json";
import deployed from "./deployed.json";
import { askToConfirmPoolInfo, getPoolInfo } from "./utils/pool";
import { BN } from "@project-serum/anchor";
import { FEE_DISCOUNT_DENOMINATOR } from "./utils/consts";
import { DecimalUtil } from "@orca-so/common-sdk";

async function main() {
  // fixed input

  const wallets = loadWallets();

  // Check required roles
  if (!wallets.poolCreatorAuthKeypair) {
    throw new Error("Please provide pool_creator_authority_wallet wallet");
  }

  const { ctx } = loadProvider(wallets.poolCreatorAuthKeypair);
  if (!wallets.poolCreatorAuthKeypair) {
    throw new Error("Please provide pool_creator_authority_wallet wallet");
  }

  if (deployed.REDEX_CONFIG_PUB === "") {
    console.log(
      "ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` ."
    );
    return;
  }

  const REDEX_CONFIG_PUB = new PublicKey(deployed.REDEX_CONFIG_PUB);
  const client = buildWhirlpoolClient(ctx);

  for (let i = 0; i < config.POOLS.length; i++) {
    let poolInfo = getPoolInfo(i);
    await askToConfirmPoolInfo(poolInfo);

    if (
      !poolInfo.discountTokenMint ||
      !poolInfo.tokenConversionRate ||
      !poolInfo.discountTokenRateOverTokenA ||
      !poolInfo.discountTokenRateOverTokenAExpo
    ) {
      throw new Error(
        "Please provide discountTokenMint, tokenConversionRate, discountTokenRateOverTokenA, discountTokenRateOverTokenAExpo"
      );
    }

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
          const discountTokenMint = new PublicKey(poolInfo.discountTokenMint);
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
            tokenConversionRate:
              poolInfo.tokenConversionRate * FEE_DISCOUNT_DENOMINATOR,
            discountFeeRate:
              poolInfo.discountFeeRateOverTokenConvertedAmount *
              FEE_DISCOUNT_DENOMINATOR,
            discountTokenRateOverTokenA: getRateOverToken(
              whirlpool.getTokenAInfo(),
              poolInfo.discountTokenRateOverTokenAExpo,
              poolInfo.discountTokenRateOverTokenA
            ),
            expo: poolInfo.discountTokenRateOverTokenAExpo,
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
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
