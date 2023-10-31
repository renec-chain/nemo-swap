import { PublicKey } from "@solana/web3.js";
import {
  PDAUtil,
  buildWhirlpoolClient,
  WhirlpoolIx,
  toTx,
  getRateOverToken,
} from "@renec/redex-sdk";
import {} from "@renec/redex-sdk/src";
import { loadProvider, loadWallets, ROLES } from "./utils";
import { FEE_DISCOUNT_DENOMINATOR } from "./utils/consts";
import { DecimalUtil, Instruction } from "@orca-so/common-sdk";
import { Decimal } from "decimal.js";

//usage: yarn set_pool_discount_info
/**
 * @ENV_Variables
 *  POOL_ADDRESS: string
 *  DISCOUNT_TOKEN_MINT: string
 *  TOKEN_CONVERSION_RATE: float
 *  DISCOUNT_FEE_RATE: float
 *  DISCOUNT_TOKEN_RATE_OVER_TOKEN_A: float
 *  DISCOUNT_TOKEN_RATE_OVER_TOKEN_A_EXPO: unsigned integer
 *
 */
async function main() {
  const poolAddressStr = process.env.POOL_ADDRESS;
  if (!poolAddressStr) {
    throw new Error("Environment variable POOL_ADDRESS is not set");
  }

  const discountTokenMintStr = process.env.DISCOUNT_TOKEN_MINT;
  if (!discountTokenMintStr) {
    throw new Error("Environment variable DISCOUNT_TOKEN_MINT is not set");
  }

  const tokenConversionRate = parseFloat(process.env.TOKEN_CONVERSION_RATE);
  if (
    isNaN(tokenConversionRate) ||
    tokenConversionRate < 0 ||
    tokenConversionRate >= 1
  ) {
    throw new Error(
      "TOKEN_CONVERSION_RATE should be a float greater or equal to 0 and less than 1"
    );
  }

  const discountFeeRate = parseFloat(process.env.DISCOUNT_FEE_RATE);
  if (isNaN(discountFeeRate) || discountFeeRate < 0 || discountFeeRate > 1) {
    throw new Error("DISCOUNT_FEE_RATE should be a float between 0 and 1");
  }

  const discountTokenRateOverTokenA = parseFloat(
    process.env.DISCOUNT_TOKEN_RATE_OVER_TOKEN_A
  );
  if (isNaN(discountTokenRateOverTokenA)) {
    throw new Error("DISCOUNT_TOKEN_RATE_OVER_TOKEN_A should be a float");
  }

  const discountTokenRateOverTokenAExpo = parseInt(
    process.env.DISCOUNT_TOKEN_RATE_OVER_TOKEN_A_EXPO
  );
  if (
    isNaN(discountTokenRateOverTokenAExpo) ||
    discountTokenRateOverTokenAExpo < 0
  ) {
    throw new Error(
      "Discount token rate over token a expo should be an unsigned integer"
    );
  }

  // log all the fields from praams
  console.log("===================================================");
  console.log("Pool address: ", poolAddressStr);
  console.log("Discount token: ", discountTokenMintStr);
  console.log("Token conversion rate: ", tokenConversionRate);
  console.log("Discount fee rate: ", discountFeeRate);
  console.log(
    "Discount token rate over token a: ",
    discountTokenRateOverTokenA
  );
  console.log(
    "Discount token rate over token a expo: ",
    discountTokenRateOverTokenAExpo
  );
  console.log("===================================================");

  // Convert strings to appropriate data types or objects
  const poolAddress = new PublicKey(poolAddressStr);
  const discountTokenMint = new PublicKey(discountTokenMintStr);

  /// Perform set pool discount info
  const wallets = loadWallets([ROLES.POOL_CREATOR_AUTH]);
  const poolCreatorAuthKeypair = wallets[ROLES.POOL_CREATOR_AUTH];

  const { ctx } = loadProvider(poolCreatorAuthKeypair);
  const client = buildWhirlpoolClient(ctx);

  try {
    const whirlpool = await client.getPool(poolAddress);
    if (whirlpool) {
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

      const params = {
        whirlpoolsConfig: whirlpoolData.whirlpoolsConfig,
        whirlpool: whirlpool.getAddress(),
        discountToken: discountTokenMint,
        whirlpoolDiscountInfoPDA,
        poolCreatorAuthority: poolCreatorAuthKeypair.publicKey,
        tokenConversionRate: tokenConversionRate * FEE_DISCOUNT_DENOMINATOR,
        discountFeeRate: discountFeeRate * FEE_DISCOUNT_DENOMINATOR,
        discountTokenRateOverTokenA: getRateOverToken(
          tokenAInfo,
          discountTokenRateOverTokenAExpo,
          new Decimal(discountTokenRateOverTokenA)
        ),
        expo: discountTokenRateOverTokenAExpo,
      };
      if (whirlpoolDiscountInfoData != null) {
        console.log("Setting pool discount info data... \n");
        ix = WhirlpoolIx.setPoolDiscountInfoIx(ctx.program, { ...params });
      } else {
        console.log("Initializing pool discount info data... \n");
        ix = WhirlpoolIx.initializePoolDiscountInfoIx(ctx.program, {
          ...params,
        });
      }

      let tx = toTx(ctx, ix);
      const txHash = await tx
        .addSigner(poolCreatorAuthKeypair)
        .buildAndExecute();
      console.log("Tx hash: ", txHash);

      whirlpoolDiscountInfoData = await client
        .getFetcher()
        .getPoolDiscountInfo(whirlpoolDiscountInfoPDA.publicKey, true);

      console.log("===================================================");
      console.log("Pool address: ", poolAddress.toString());
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

main().catch((reason) => {
  console.log("ERROR:", reason);
});
