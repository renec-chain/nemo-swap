import { PublicKey, Keypair, TransactionInstruction } from "@solana/web3.js";
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
import { u64 } from "@solana/spl-token";
import {
  GaslessDapp,
  GaslessTransaction,
  sendToGasless,
} from "@renec-foundation/gasless-sdk";
const SLIPPAGE = Percentage.fromFraction(1, 100);

async function main() {
  const wallets = loadWallets([ROLES.TOKEN_MINT_AUTH]);

  const tokenMintAuth = wallets[ROLES.TOKEN_MINT_AUTH];
  // Generate new wallets for testing
  const { ctx } = loadProvider(tokenMintAuth);
  const client = buildWhirlpoolClient(ctx);

  const newWallet = await genNewWallet(ctx.connection);

  console.log("new wallet:", newWallet.publicKey.toString());

  const poolInfo0 = getPoolInfo(0);
  const poolInfo1 = getPoolInfo(1);

  const pool0 = await getWhirlPool(client, poolInfo0);
  const pool1 = await getWhirlPool(client, poolInfo1);

  // GEt swap tokens
  const twoHopTokens = getTwoHopSwapTokens(poolInfo0, poolInfo1);
  const amount = new u64(100);
  const quote1 = await swapQuoteByInputToken(
    pool0,
    twoHopTokens.pool1OtherToken,
    amount,
    SLIPPAGE,
    ctx.program.programId,
    ctx.fetcher,
    true
  );

  console.log("quote1:", quote1);
  console.log("intermidaryToken:", twoHopTokens.intermidaryToken);
  console.log("pool2 other token:", twoHopTokens.pool2OtherToken);
  console.log("pool1 other token:", quote1.estimatedAmountOut.toNumber());
  const quote2 = await swapQuoteByInputToken(
    pool1,
    twoHopTokens.intermidaryToken,
    quote1.estimatedAmountOut,
    SLIPPAGE,
    ctx.program.programId,
    ctx.fetcher,
    true
  );
  console.log("quote2:", quote2);

  // two hop swap
  const tx = await client.twoHopSwap(quote1, pool0, quote2, pool1, newWallet);

  // Construct gasless txn
  const dappUtil = await GaslessDapp.new(ctx.connection);
  const gaslessTxn = GaslessTransaction.fromTransactionBuilder(
    ctx.connection,
    newWallet as CustomWallet,
    tx.compressIx(true),
    dappUtil
  );

  const txId = gaslessTxn.asyncBuildAndExecute((error: any, txId: string) => {
    if (error) {
      console.log("error:", error);
    } else {
      console.log("txId:", txId);
    }
  });
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
