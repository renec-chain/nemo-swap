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
  SwapQuote,
  Whirlpool,
  WhirlpoolClient,
  buildWhirlpoolClient,
  swapQuoteByInputToken,
  swapWithFeeDiscountQuoteByInputToken,
} from "@renec/redex-sdk";
import {
  getConfig,
  loadProvider,
  loadWallets,
  ROLES,
} from "../../create_pool/utils";
import {
  genNewWallet,
  getWhirlPool,
  createTokenAccountAndMintTo,
  executeGaslessTx,
  getTwoHopSwapTokens,
  getLogMemoIx,
} from "../../swap/utils";
import { getPoolInfo } from "../../create_pool/utils/pool";

import { u64 } from "@solana/spl-token";
import {
  GaslessDapp,
  GaslessTransaction,
  Wallet,
} from "@renec-foundation/gasless-sdk";
import { Address, BN } from "@project-serum/anchor";
import { compareTxSize } from "../utils/version";
import { loadLookupTable } from "../utils/helper";
import { getTwoHopSwapIx } from "./utils";

const SLIPPAGE = Percentage.fromFraction(1, 100);

//usage: 02_two_hop_swap <pool-idx-0> <pool-idx-1> <pool-idx-2> <discount-token-mint | null>
async function main() {
  const wallets = loadWallets([ROLES.USER]);
  const userAuth = wallets[ROLES.USER];

  // Generate new wallets for testing
  const { ctx } = loadProvider(userAuth);
  const client = buildWhirlpoolClient(ctx);
  const newWallet = await genNewWallet(ctx.connection);

  console.log("new wallet created:", newWallet.publicKey.toString());

  // Get pool from terminal
  const poolIdx0 = parseInt(process.argv[2]);
  const poolIdx1 = parseInt(process.argv[3]);
  const poolIdx2 = parseInt(process.argv[4]);

  const discountTokenMintStr = process.argv[5];
  const discountTokenMint = discountTokenMintStr
    ? new PublicKey(discountTokenMintStr)
    : null;

  if (isNaN(poolIdx0) || isNaN(poolIdx1) || isNaN(poolIdx2)) {
    console.error("Please provide two valid pool indexes.");
    return;
  }

  const pool0 = await getWhirlPool(client, getPoolInfo(poolIdx0));
  const pool1 = await getWhirlPool(client, getPoolInfo(poolIdx1));
  const pool2 = await getWhirlPool(client, getPoolInfo(poolIdx2));

  const swapAmount = new BN(100000);
  await swapThreeHops(
    "three hops ",
    client,
    pool0,
    pool1,
    pool2,
    [0],
    [swapAmount.toNumber()],
    swapAmount,
    newWallet,
    discountTokenMint,
    true
  );
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});

const swapThreeHops = async (
  testCase: string,
  client: WhirlpoolClient,
  pool0: Whirlpool,
  pool1: Whirlpool,
  pool2: Whirlpool,
  mintAts: number[],
  mintAmounts: number[],
  swapAmount: BN,
  walletKeypair: Keypair,
  feeDiscountToken?: PublicKey,
  executeGasless = false
) => {
  console.log("\n\n Test case: ", testCase);

  const wallet = new Wallet(walletKeypair);
  // Swap route: reusd -> revnd -> rebtc -> reeth
  const twoHopsSwapToken = getTwoHopSwapTokens(pool0, pool1); // reusd - revnd - rebtc
  console.log(
    `Swap routes: ${twoHopsSwapToken.pool1OtherToken.toString()} -> ${twoHopsSwapToken.intermidaryToken.toString()} -> ${twoHopsSwapToken.pool2OtherToken.toString()}}`
  );

  await createTokenAccounts(
    client,
    [
      twoHopsSwapToken.pool1OtherToken,
      twoHopsSwapToken.intermidaryToken,
      twoHopsSwapToken.pool2OtherToken,
    ],
    mintAts,
    mintAmounts,
    wallet.publicKey
  );

  if (feeDiscountToken) {
    await createTokenAccountAndMintTo(
      client.getContext().provider,
      feeDiscountToken,
      wallet.publicKey,
      10
    );
  }

  // Swap three hops
  const { tx, quote2 } = await getTwoHopSwapIx(
    client,
    pool0,
    pool1,
    wallet,
    swapAmount,
    feeDiscountToken
  );

  // Get swap ix
  let thirdQuote;
  if (feeDiscountToken) {
    thirdQuote = await swapWithFeeDiscountQuoteByInputToken(
      pool2,
      feeDiscountToken,
      twoHopsSwapToken.pool2OtherToken,
      quote2.estimatedAmountOut,
      SLIPPAGE,
      client.getContext().program.programId,
      client.getContext().fetcher,
      true
    );
  } else {
    thirdQuote = await swapQuoteByInputToken(
      pool2,
      twoHopsSwapToken.pool2OtherToken,
      quote2.estimatedAmountOut,
      SLIPPAGE,
      client.getContext().program.programId,
      client.getContext().fetcher,
      true
    );
  }

  const thirdQuoteTx = await pool2.swap(thirdQuote, wallet.publicKey);

  tx.addInstruction(thirdQuoteTx.compressIx(true));

  const lookupTableData = loadLookupTable();
  const lookupTableAddress0 = lookupTableData[pool0.getAddress().toBase58()];
  const lookupTableAddress1 = lookupTableData[pool1.getAddress().toBase58()];
  const lookupTableAddress2 = lookupTableData[pool2.getAddress().toBase58()];

  // Check if lookup table addresses are found, otherwise handle the error or fallback
  if (!lookupTableAddress0 || !lookupTableAddress1 || !lookupTableAddress2) {
    console.error("Lookup table addresses for pools not found.");
    return;
  }

  let lookUpTables = [
    new PublicKey(lookupTableAddress0),
    new PublicKey(lookupTableAddress1),
    new PublicKey(lookupTableAddress2),
  ];
  const txIxs = tx.compressIx(true);

  await compareTxSize(
    client.getContext().connection,
    walletKeypair,
    txIxs.instructions.concat(txIxs.cleanupInstructions),
    lookUpTables,
    txIxs.signers
  );

  return;
  try {
    console.log("tx size: ", await tx.txnSize());
  } catch (e) {
    console.log("tx failed: ", e);
  }

  // Construct gasless txn
  const dappUtil = await GaslessDapp.new(client.getContext().connection);
  const gaslessTxn = GaslessTransaction.fromTransactionBuilder(
    client.getContext().connection,
    wallet,
    tx.compressIx(true),
    dappUtil
  );

  await executeGaslessTx(gaslessTxn, executeGasless);
};

const createTokenAccounts = async (
  client: WhirlpoolClient,
  tokens: Address[],
  mintAts: number[],
  mintAmounts: number[],
  des: PublicKey
) => {
  for (let i = 0; i < mintAts.length; i++) {
    await createTokenAccountAndMintTo(
      client.getContext().provider,
      new PublicKey(tokens[mintAts[i]]),
      des,
      mintAmounts[i]
    );
  }
};
