import { PublicKey, Signer } from "@solana/web3.js";
import { PDAUtil, Whirlpool, WhirlpoolContext, WhirlpoolIx, toTx } from "../../src";
import { BN } from "@project-serum/anchor";
import anchor from "@project-serum/anchor";

export const initializePoolDiscountInfo = async (
  ctx: WhirlpoolContext,
  whirlpool: Whirlpool,
  discountTokenMint: PublicKey,
  tokenConversionRate: number,
  discountFeeRate: number,
  discountTokenRateOverTokenA: BN,
  expo: number,
  wallet?: Signer
): Promise<PublicKey> => {
  let poolCreatorAuthority = wallet?.publicKey || ctx.wallet.publicKey;
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
    poolCreatorAuthority,
    tokenConversionRate: tokenConversionRate,
    discountFeeRate: discountFeeRate,
    expo,
    discountTokenRateOverTokenA: discountTokenRateOverTokenA,
  });

  let tx = toTx(ctx, ix);
  if (wallet) {
    tx = tx.addSigner(wallet);
  }
  await tx.buildAndExecute();

  return whirlpoolDiscountInfoPDA.publicKey;
};

export const setPoolDiscountInfo = async (
  ctx: WhirlpoolContext,
  whirlpool: Whirlpool,
  discountTokenMint: PublicKey,
  tokenConversionRate: number,
  discountFeeRate: number,
  discountTokenRateOverTokenA: BN,
  expo: number,
  wallet?: Signer
): Promise<PublicKey> => {
  let poolCreatorAuthority = wallet?.publicKey || ctx.wallet.publicKey;
  const whirlpoolDiscountInfoPDA = PDAUtil.getWhirlpoolDiscountInfo(
    ctx.program.programId,
    whirlpool.getAddress(),
    discountTokenMint
  );

  const whirlpoolData = await whirlpool.refreshData();
  const ix = WhirlpoolIx.setPoolDiscountInfoIx(ctx.program, {
    whirlpoolsConfig: whirlpoolData.whirlpoolsConfig,
    whirlpool: whirlpool.getAddress(),
    discountToken: discountTokenMint,
    whirlpoolDiscountInfoPDA,
    poolCreatorAuthority,
    tokenConversionRate: tokenConversionRate,
    discountFeeRate: discountFeeRate,
    expo,
    discountTokenRateOverTokenA: discountTokenRateOverTokenA,
  });

  let tx = toTx(ctx, ix);
  if (wallet) {
    tx = tx.addSigner(wallet);
  }
  await tx.buildAndExecute();

  return whirlpoolDiscountInfoPDA.publicKey;
};

export const isApproxEqual = (a: anchor.BN, b: anchor.BN, diff: anchor.BN): boolean => {
  // Get 2% of diff
  const twoPercentOfDiff = diff.mul(new BN(2)).div(new BN(100));

  // Get the upper bound of b + c
  const upperBound = b.add(diff).add(twoPercentOfDiff);

  // Get the lower bound of b - c
  const lowerBound = b.add(diff).sub(twoPercentOfDiff);

  // if a between lower and upper, return true
  if (a.gte(lowerBound) && a.lte(upperBound)) {
    return true;
  }
  return false;
};
