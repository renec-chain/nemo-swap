import { buildWhirlpoolClient, PriceMath } from "@renec/redex-sdk";
import {
  loadProvider,
  delay,
  getTokenMintInfo,
  loadWallets,
  ROLES,
} from "../create_pool/utils";
import deployed from "../create_pool/deployed.json";
import { PublicKey } from "@solana/web3.js";

async function main() {
  const wallets = loadWallets([ROLES.USER]);
  const userKeypair = wallets[ROLES.USER];

  const { ctx } = loadProvider(userKeypair);

  if (deployed.REDEX_CONFIG_PUB === "") {
    console.log(
      "ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` ."
    );
    return;
  }

  const client = buildWhirlpoolClient(ctx);

  const positionPubkey = new PublicKey(
    "86qbmkGmmcbPZR7pniXYG7hYG4Rxgi3nQM3nCFTF7ABU"
  );
  const postiion = await client.getPosition(positionPubkey);
  console.log(
    "growth inside check point: ",
    postiion.getData().rewardInfos[0].growthInsideCheckpoint.toNumber()
  );
  console.log(
    "growth outside check point: ",
    postiion.getData().rewardInfos[0].amountOwed.toNumber()
  );
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
