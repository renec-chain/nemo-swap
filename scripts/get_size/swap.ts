import { PublicKey, Keypair } from "@solana/web3.js";
import { Percentage } from "@orca-so/common-sdk";
import {
  PDAUtil,
  buildWhirlpoolClient,
  swapQuoteByInputToken,
} from "@renec/redex-sdk";
import { loadProvider, loadWallets, ROLES } from "../create_pool/utils";
import { genNewWallet } from "./utils";

async function main() {
  const wallets = loadWallets([ROLES.TOKEN_MINT_AUTH]);

  const tokenMintAuth = wallets[ROLES.TOKEN_MINT_AUTH];

  const { ctx } = loadProvider(tokenMintAuth);
  const newWallet = genNewWallet(ctx.connection);
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
