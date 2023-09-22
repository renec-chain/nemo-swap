import { PublicKey, Signer } from "@solana/web3.js";
import { PDAUtil, Whirlpool, WhirlpoolContext, WhirlpoolIx, toTx } from "../../src";
import { BN } from "@project-serum/anchor";

export const initializePoolDiscountInfo = async (
  ctx: WhirlpoolContext,
  whirlpool: Whirlpool,
  discountTokenMint: PublicKey,
  tokenConversionRate: number,
  discountFeeRate: number,
  discountTokenRateOverTokenA: BN,
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
    discountTokenRateOverTokenA: discountTokenRateOverTokenA,
  });

  let tx = toTx(ctx, ix);
  if (wallet) {
    tx = tx.addSigner(wallet);
  }
  await tx.buildAndExecute();

  return whirlpoolDiscountInfoPDA.publicKey;
};
