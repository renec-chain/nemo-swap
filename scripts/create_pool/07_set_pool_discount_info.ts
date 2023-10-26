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
import deployed from "./deployed.json";
import { getPoolInfo } from "./utils/pool";
import { FEE_DISCOUNT_DENOMINATOR } from "./utils/consts";
import { DecimalUtil, Instruction } from "@orca-so/common-sdk";
import { Decimal } from "decimal.js";

//usage: yarn set_pool_discount_info <pool_address> <discount_token_mint> <token_conversion_rate> <discount-fee-rate> <discount_token_rate_over_token_a> <discount_token_rate_over_token_a_expo>
async function main() {
  const poolAddressStr = process.argv[2];
  if (!poolAddressStr) {
    throw new Error("Please provide a pool address as the first argument");
  }

  const discountTokenMintStr = process.argv[3];
  if (!discountTokenMintStr) {
    throw new Error(
      "Please provide a discount token mint as the second argument"
    );
  }

  const tokenConversionRate = parseFloat(process.argv[4]);
  if (
    isNaN(tokenConversionRate) ||
    tokenConversionRate < 0 ||
    tokenConversionRate > 1
  ) {
    throw new Error("Token conversion rate should be a float between 0 and 1");
  }

  const discountFeeRate = parseFloat(process.argv[5]);
  if (isNaN(discountFeeRate) || discountFeeRate < 0 || discountFeeRate > 1) {
    throw new Error("Discount fee rate should be a float between 0 and 1");
  }

  const discountTokenRateOverTokenA = parseFloat(process.argv[6]);
  if (isNaN(discountTokenRateOverTokenA)) {
    throw new Error("Discount token rate over token a should be a float");
  }

  const discountTokenRateOverTokenAExpo = parseInt(process.argv[7]);
  if (
    isNaN(discountTokenRateOverTokenAExpo) ||
    discountTokenRateOverTokenAExpo < 0
  ) {
    throw new Error(
      "Discount token rate over token a expo should be an unsigned integer"
    );
  }

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
