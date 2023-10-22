import { PublicKey } from "@solana/web3.js";
import {
  PDAUtil,
  buildWhirlpoolClient,
  WhirlpoolIx,
  toTx,
  getRateOverToken,
} from "@renec/redex-sdk";
import {} from "@renec/redex-sdk/src";
import { loadProvider, getTokenMintInfo, loadWallets, ROLES } from "./utils";
import config from "./config.json";
import deployed from "./deployed.json";
import { askToConfirmPoolInfo, getPoolInfo } from "./utils/pool";
import { BN } from "@project-serum/anchor";
import { FEE_DISCOUNT_DENOMINATOR } from "./utils/consts";
import { DecimalUtil, Instruction } from "@orca-so/common-sdk";

async function main() {
  let poolIndex = parseInt(process.argv[2]);

  if (isNaN(poolIndex)) {
    poolIndex = 0;
    console.error("Using default pool index 0");
  }

  const wallets = loadWallets([ROLES.POOL_CREATOR_AUTH]);
  const poolCreatorAuthKeypair = wallets[ROLES.POOL_CREATOR_AUTH];

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
        const tokenAInfo = whirlpool.getTokenAInfo();

        let ix: Instruction;
        let whirlpoolDiscountInfoData = await client
          .getFetcher()
          .getPoolDiscountInfo(whirlpoolDiscountInfoPDA.publicKey);

        if (whirlpoolDiscountInfoData != null) {
          console.log("Setting pool discount info data... \n");
          ix = WhirlpoolIx.setPoolDiscountInfoIx(ctx.program, {
            whirlpoolsConfig: whirlpoolData.whirlpoolsConfig,
            whirlpool: whirlpool.getAddress(),
            discountToken: discountTokenMint,
            whirlpoolDiscountInfoPDA,
            poolCreatorAuthority: poolCreatorAuthKeypair.publicKey,
            tokenConversionRate:
              poolInfo.tokenConversionRate * FEE_DISCOUNT_DENOMINATOR,
            discountFeeRate:
              poolInfo.discountFeeRateOverTokenConvertedAmount *
              FEE_DISCOUNT_DENOMINATOR,
            discountTokenRateOverTokenA: getRateOverToken(
              tokenAInfo,
              poolInfo.discountTokenRateOverTokenAExpo,
              poolInfo.discountTokenRateOverTokenA
            ),
            expo: poolInfo.discountTokenRateOverTokenAExpo,
          });
        } else {
          console.log("Initializing pool discount info data... \n");
          ix = WhirlpoolIx.initializePoolDiscountInfoIx(ctx.program, {
            whirlpoolsConfig: whirlpoolData.whirlpoolsConfig,
            whirlpool: whirlpool.getAddress(),
            discountToken: discountTokenMint,
            whirlpoolDiscountInfoPDA,
            poolCreatorAuthority: poolCreatorAuthKeypair.publicKey,
            tokenConversionRate:
              poolInfo.tokenConversionRate * FEE_DISCOUNT_DENOMINATOR,
            discountFeeRate:
              poolInfo.discountFeeRateOverTokenConvertedAmount *
              FEE_DISCOUNT_DENOMINATOR,
            discountTokenRateOverTokenA: getRateOverToken(
              tokenAInfo,
              poolInfo.discountTokenRateOverTokenAExpo,
              poolInfo.discountTokenRateOverTokenA
            ),
            expo: poolInfo.discountTokenRateOverTokenAExpo,
          });
        }

        let tx = toTx(ctx, ix);
        const txHash = await tx.buildAndExecute();
        console.log("Tx hash: ", txHash);

        whirlpoolDiscountInfoData = await client
          .getFetcher()
          .getPoolDiscountInfo(whirlpoolDiscountInfoPDA.publicKey, true);

        console.log("===================================================");
        console.log("Pool address: ", whirlpoolPda.publicKey.toString());
        console.log("Discount token: ", discountTokenMint.toString());
        console.log(
          `Token conversion rate: ${
            (whirlpoolDiscountInfoData.tokenConversionFeeRate /
              FEE_DISCOUNT_DENOMINATOR) *
            100
          } %`
        );
        console.log(
          `Discount fee rate: ${
            (whirlpoolDiscountInfoData.discountFeeRate /
              FEE_DISCOUNT_DENOMINATOR) *
            100
          } %`
        );
        console.log("Expo: ", whirlpoolDiscountInfoData.expo.toString());

        console.log(
          `Discount token rate over token a: ${DecimalUtil.fromU64(
            whirlpoolDiscountInfoData.discountTokenRateOverTokenA,
            whirlpool.getTokenAInfo().decimals + whirlpoolDiscountInfoData.expo
          )}`
        );

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
