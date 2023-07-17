import { PublicKey } from "@solana/web3.js";
import { MathUtil, Percentage } from "@orca-so/common-sdk";
import {
  PDAUtil,
  buildWhirlpoolClient,
  PriceMath,
  swapQuoteByInputToken,
} from "@renec/redex-sdk";
import { loadProvider, getTokenMintInfo, loadWallets } from "./utils";
import Decimal from "decimal.js";
import config from "./config.json";
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
    "HCH1BZhvWvyVEUUMLHKHthvRucExkDAYqPso5NvvP1Z7"
  );
  const client = buildWhirlpoolClient(ctx);
  const whirlpool = await client.getPool(whirlpoolKey, true);
  const whirlpoolData = whirlpool.getData();
  const quote = await swapQuoteByInputToken(
    whirlpool,
    whirlpoolData.tokenMintB,
    new u64(1000),
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

main().catch((reason) => {
  console.log("ERROR:", reason);
});
