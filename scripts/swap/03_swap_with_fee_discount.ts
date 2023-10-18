import { PublicKey } from "@solana/web3.js";
import { MathUtil, Percentage } from "@orca-so/common-sdk";
import {
  PDAUtil,
  buildWhirlpoolClient,
  swapQuoteByInputToken,
  swapWithFeeDiscountQuoteByInputToken,
} from "@renec/redex-sdk";
import {
  loadProvider,
  getTokenMintInfo,
  loadWallets,
  ROLES,
} from "../create_pool/utils";
import deployed from "../create_pool//deployed.json";
import { askToConfirmPoolInfo, getPoolInfo } from "../create_pool/utils/pool";
import { u64 } from "@solana/spl-token";

async function main() {
  const wallets = loadWallets([ROLES.USER]);
  const userKeypair = wallets[ROLES.USER];

  const { ctx } = loadProvider(userKeypair);
  const REDEX_CONFIG_PUB = new PublicKey(deployed.REDEX_CONFIG_PUB);
  const client = buildWhirlpoolClient(ctx);

  let poolInfo = getPoolInfo(0);
  await askToConfirmPoolInfo(poolInfo);

  if (!poolInfo.discountTokenMint) {
    console.log("Discount token mint is not found.");
    return;
  }

  const discountTokenMint = new PublicKey(poolInfo.discountTokenMint);

  const mintAPub = new PublicKey(poolInfo.tokenMintA);
  const mintBPub = new PublicKey(poolInfo.tokenMintB);
  const tokenMintA = await getTokenMintInfo(ctx, mintAPub);
  const tokenMintB = await getTokenMintInfo(ctx, mintBPub);

  if (tokenMintA && tokenMintB) {
    const whirlpoolPda = PDAUtil.getWhirlpool(
      ctx.program.programId,
      REDEX_CONFIG_PUB,
      mintAPub,
      mintBPub,
      poolInfo.tickSpacing
    );
    const whirlpool = await client.getPool(whirlpoolPda.publicKey);
    const whirlpoolData = whirlpool.getData();

    const quote = await swapWithFeeDiscountQuoteByInputToken(
      whirlpool,
      discountTokenMint,
      whirlpoolData.tokenMintA,
      new u64(1000),
      Percentage.fromFraction(1, 100),
      ctx.program.programId,
      ctx.fetcher,
      true
    );

    const tx = await whirlpool.swapWithFeeDiscount(
      quote,
      discountTokenMint,
      userKeypair.publicKey
    );
    tx.addSigner(wallets.userKeypair);
    const sig = await tx.buildAndExecute();
    console.log(sig);
  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
