import { buildWhirlpoolClient, PriceMath } from "@renec/redex-sdk";
import { loadProvider, delay, getTokenMintInfo, loadWallets } from "./utils";
import deployed from "./deployed.json";

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

  const client = buildWhirlpoolClient(ctx);
  const positions = await client.getAllPositionsOf(ctx.wallet.publicKey);

  console.log("Number of positions: ", positions.length);
  for (let i = 0; i < positions.length; i++) {
    let position = positions[i].getData();
    console.log("Position ", i);
    console.log("Liquidity ", position.liquidity.toNumber() / 1e9);
    console.log(
      "Lower Price ",
      PriceMath.tickIndexToPrice(position.tickLowerIndex, 9, 9)
    );
    console.log(
      "Upper Price ",
      PriceMath.tickIndexToPrice(position.tickUpperIndex, 9, 9)
    );

    console.log(position.rewardInfos);
  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
