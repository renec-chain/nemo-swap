import { PublicKey, Keypair } from "@solana/web3.js";
import { Percentage } from "@orca-so/common-sdk";
import {
  PDAUtil,
  buildWhirlpoolClient,
  swapQuoteByInputToken,
} from "@renec/redex-sdk";
import { loadProvider, loadWallets, ROLES } from "../create_pool/utils";
import { CustomWallet, genNewWallet, getWhirlPool } from "./utils";
import { getPoolInfo } from "../create_pool/utils/pool";
import { getTwoHopSwapTokens } from "./utils/swap";
import { TOKEN_PROGRAM_ID, Token, u64 } from "@solana/spl-token";
import { GaslessDapp, GaslessTransaction } from "@renec-foundation/gasless-sdk";
const SLIPPAGE = Percentage.fromFraction(1, 100);

async function main() {
  const wallets = loadWallets([ROLES.TOKEN_MINT_AUTH]);
  const tokenMintAuth = wallets[ROLES.TOKEN_MINT_AUTH];

  // Generate new wallets for testing
  const { ctx } = loadProvider(tokenMintAuth);
  const client = buildWhirlpoolClient(ctx);

  const dappUtil = await GaslessDapp.new(ctx.connection);
  const gaslessTxn = new GaslessTransaction(
    ctx.connection,
    ctx.wallet as CustomWallet,
    dappUtil
  );
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
