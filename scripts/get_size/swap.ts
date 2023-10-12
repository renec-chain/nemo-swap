import { PublicKey } from "@solana/web3.js";
import { Percentage } from "@orca-so/common-sdk";
import {
  PDAUtil,
  buildWhirlpoolClient,
  swapQuoteByInputToken,
} from "@renec/redex-sdk";
import {
  loadProvider,
  getTokenMintInfo,
  loadWallets,
} from "../create_pool/utils";
import deployed from "../create_pool/deployed.json";
import { askToConfirmPoolInfo, getPoolInfo } from "../create_pool/utils/pool";
import { u64 } from "@solana/spl-token";

async function main() {
  const wallets = loadWallets();

  if (!wallets.userKeypair) {
    throw new Error("Please provide user_wallet wallet");
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

    console.log("Token mint A: ", whirlpoolData.tokenMintA.toBase58());
    console.log("Token mint B: ", whirlpoolData.tokenMintB.toBase58());
    console.log("pool info: ", whirlpoolData);

    const quote = await swapQuoteByInputToken(
      whirlpool,
      whirlpoolData.tokenMintA,
      new u64(1),
      Percentage.fromFraction(50, 100),
      ctx.program.programId,
      ctx.fetcher,
      true
    );

    console.log("quote:", quote);

    const tx = await whirlpool.swap(quote, wallets.userKeypair.publicKey);
    tx.addSigner(wallets.userKeypair);
    const sig = await tx.buildAndExecute();
    console.log(sig);
  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
