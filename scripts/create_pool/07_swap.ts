import { PublicKey } from "@solana/web3.js";
import { MathUtil, Percentage } from "@orca-so/common-sdk";
import {
  PDAUtil,
  buildWhirlpoolClient,
  swapQuoteByInputToken,
} from "@renec/redex-sdk";
import { loadProvider, getTokenMintInfo, loadWallets } from "./utils";
import deployed from "./deployed.json";
import { askToConfirmPoolInfo, getPoolInfo } from "./utils/pool";
import { u64 } from "@solana/spl-token";

async function main() {
  const wallets = loadWallets();

  if (!wallets.poolCreatorAuthKeypair) {
    throw new Error("Please provide pool_creator_authority_wallet wallet");
  }

  const { ctx } = loadProvider(wallets.poolCreatorAuthKeypair);

  if (deployed.REDEX_CONFIG_PUB === "") {
    console.log(
      "ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` ."
    );
    return;
  }
  const REDEX_CONFIG_PUB = new PublicKey(deployed.REDEX_CONFIG_PUB);
  const whirlpoolKey = new PublicKey(
    "HmruH4dvo1FdsLNDpFFnurtm6ih3YhwcbiDNnHu8bec2"
  );
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

    const quote = await swapQuoteByInputToken(
      whirlpool,
      whirlpoolData.tokenMintA,
      new u64(100),
      Percentage.fromFraction(1, 100),
      ctx.program.programId,
      ctx.fetcher,
      true
    );
    console.log(quote);
    const tx = await whirlpool.swap(quote, wallets.userKeypair.publicKey);
    tx.addSigner(wallets.userKeypair);
    const sig = await tx.buildAndExecute();
    console.log(sig);
  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
