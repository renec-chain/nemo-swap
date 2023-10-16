import {
  PublicKey,
  Keypair,
  TransactionInstruction,
  Connection,
} from "@solana/web3.js";
import {
  Percentage,
  TransactionBuilder,
  TransactionPayload,
} from "@orca-so/common-sdk";
import {
  PDAUtil,
  buildWhirlpoolClient,
  swapQuoteByInputToken,
} from "@renec/redex-sdk";
import { loadProvider, loadWallets, ROLES } from "../create_pool/utils";
import {
  CustomWallet,
  genNewWallet,
  getWhirlPool,
  mintToByAuthority,
} from "./utils";
import { getPoolInfo } from "../create_pool/utils/pool";
import { executeGaslessTx, getTwoHopSwapTokens } from "./utils/swap";
import { u64 } from "@solana/spl-token";
import {
  GaslessDapp,
  GaslessTransaction,
  sendToGasless,
} from "@renec-foundation/gasless-sdk";
import { exec } from "mz/child_process";
import { Wallet } from "@project-serum/anchor";

const SLIPPAGE = Percentage.fromFraction(1, 100);

async function main() {
  const wallets = loadWallets([ROLES.TOKEN_MINT_AUTH]);

  const tokenMintAuth = wallets[ROLES.TOKEN_MINT_AUTH];
  // Generate new wallets for testing
  const { ctx } = loadProvider(tokenMintAuth);
  const client = buildWhirlpoolClient(ctx);

  const newWalletKeypair = await genNewWallet(ctx.connection);
  console.log("new wallet:", newWalletKeypair.publicKey.toString());

  const poolInfo0 = getPoolInfo(0);
  const poolInfo1 = getPoolInfo(1);

  const pool0 = await getWhirlPool(client, poolInfo0);
  const pool1 = await getWhirlPool(client, poolInfo1);

  // GEt swap tokens
  const twoHopTokens = getTwoHopSwapTokens(pool0, pool1);

  // await mintToByAuthority(
  //   ctx.provider,
  //   new PublicKey(twoHopTokens.intermidaryToken),
  //   newWallet.publicKey,
  //   0
  // );
  // await mintToByAuthority(
  //   ctx.provider,
  //   new PublicKey(twoHopTokens.pool2OtherToken),
  //   newWallet.publicKey,
  //   0
  // );

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

  const quote2 = await swapQuoteByInputToken(
    pool1,
    twoHopTokens.intermidaryToken,
    quote1.estimatedAmountOut,
    SLIPPAGE,
    ctx.program.programId,
    ctx.fetcher,
    true
  );

  // two hop swap
  const wallet = new Wallet(newWalletKeypair);
  const tx = await client.twoHopSwap(quote1, pool0, quote2, pool1, wallet);

  // Construct gasless txn
  const dappUtil = await GaslessDapp.new(ctx.connection);
  const gaslessTxn = GaslessTransaction.fromTransactionBuilder(
    ctx.connection,
    wallet as CustomWallet,
    tx.compressIx(true),
    dappUtil
  );

  await executeGaslessTx(gaslessTxn, true);
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
