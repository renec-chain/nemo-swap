import { PublicKey } from "@solana/web3.js";
import { MathUtil, Percentage } from "@orca-so/common-sdk";
import {
  PDAUtil,
  buildWhirlpoolClient,
  swapQuoteByInputToken,
  swapWithFeeDiscountQuoteByInputToken,
} from "@renec/redex-sdk";
import { loadProvider, getTokenMintInfo, loadWallets } from "./utils";
import deployed from "./deployed.json";
import { askToConfirmPoolInfo, getPoolInfo } from "./utils/pool";
import { u64 } from "@solana/spl-token";

async function main() {
  const wallets = loadWallets();

  if (!wallets.userKeypair) {
    throw new Error("Please provide pool_creator_authority_wallet wallet");
  }

  const { ctx } = loadProvider(wallets.userKeypair);

  if (deployed.REDEX_CONFIG_PUB === "") {
    console.log(
      "ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` ."
    );
    return;
  }
  const REDEX_CONFIG_PUB = new PublicKey(deployed.REDEX_CONFIG_PUB);
  const client = buildWhirlpoolClient(ctx);

  let poolInfo = getPoolInfo(0);
  await askToConfirmPoolInfo(poolInfo);
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

    console.log("Token mint a: ", whirlpoolData.tokenMintA.toString());
    console.log("Token mint b: ", whirlpoolData.tokenMintB.toString());

    const discountToken = new PublicKey(
      "CWSVAfEa5hRDaSjb9YVccxZDtogBchTWFmRoqrKa7qC7"
    );
    const whirlpooDiscountInfoData = await ctx.fetcher.getPoolDiscountInfo(
      PDAUtil.getWhirlpoolDiscountInfo(
        ctx.program.programId,
        whirlpoolPda.publicKey,
        discountToken
      ).publicKey
    );

    console.log("Discount token: ", whirlpooDiscountInfoData);

    const quote = await swapWithFeeDiscountQuoteByInputToken(
      whirlpool,
      whirlpooDiscountInfoData,
      whirlpoolData.tokenMintA,
      new u64(1000000000),
      Percentage.fromFraction(1, 100),
      ctx.program.programId,
      ctx.fetcher,
      true
    );
    console.log(quote);
    const tx = await whirlpool.swapWithFeeDiscount(
      quote,
      discountToken,
      wallets.userKeypair.publicKey
    );
    tx.addSigner(wallets.userKeypair);
    const sig = await tx.buildAndExecute();
    console.log(sig);
  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
