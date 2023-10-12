import { PublicKey } from "@solana/web3.js";
import { PDAUtil, buildWhirlpoolClient, PriceMath } from "@renec/redex-sdk";
import { loadProvider, getTokenMintInfo, loadWallets } from "./utils";

import deployed from "./deployed.json";

async function main() {
  const wallets = loadWallets();

  if (!wallets.deployerKeypair) {
    throw new Error("Please provide pool_creator_authority_wallet wallet");
  }
  console.log("pool creator: ", wallets.deployerKeypair.publicKey.toString());

  const { ctx } = loadProvider(wallets.deployerKeypair);

  if (deployed.REDEX_CONFIG_PUB === "") {
    console.log(
      "ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` ."
    );
    return;
  }
  const client = buildWhirlpoolClient(ctx);

  const whirlpool = await client.getPool(
    "BQ2sH6LqkhnNZofKXtApHz12frTv1wfbihMg6osMnHx8"
  );
  console.log(whirlpool.getData().whirlpoolsConfig.toBase58());
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
