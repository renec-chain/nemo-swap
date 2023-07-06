import { buildWhirlpoolClient, PriceMath } from "@renec/redex-sdk";
import { loadProvider, loadWallets } from "./utils";
import { PublicKey } from "@solana/web3.js";
import { configEnv } from "../env.config";

async function main() {
  const wallets = loadWallets();

  if (!wallets.userKeypair) {
    throw new Error("Please provide user_wallet wallet");
  }

  const { ctx } = loadProvider(wallets.userKeypair);
  let REDEX_CONFIG_PUB: PublicKey;

  try {
    REDEX_CONFIG_PUB = new PublicKey(configEnv.REDEX_CONFIG_PUB);
  } catch (e) {
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
  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
