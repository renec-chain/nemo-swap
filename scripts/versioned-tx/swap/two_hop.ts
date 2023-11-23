import { PublicKey, Keypair } from "@solana/web3.js";
import { Percentage, TransactionBuilder } from "@orca-so/common-sdk";
import {
  Whirlpool,
  WhirlpoolClient,
  buildWhirlpoolClient,
} from "@renec/redex-sdk";
import { loadProvider, loadWallets, ROLES } from "../../create_pool/utils";
import {
  genNewWallet,
  getWhirlPool,
  createTokenAccountAndMintTo,
  executeGaslessTx,
  getTwoHopSwapTokens,
} from "../../swap/utils";
import { getPoolInfo } from "../../create_pool/utils/pool";

import {
  GaslessDapp,
  GaslessTransaction,
  Wallet,
} from "@renec-foundation/gasless-sdk";
import { Address, BN } from "@project-serum/anchor";
import { compareTxSize } from "../utils/version";
import { createTokenAccounts, getTwoHopSwapIx } from "./utils";
import { loadLookupTable } from "../utils/helper";

//usage: 02_two_hop_swap <pool-idx-0> <pool-idx-1> <discount-token-mint | null>
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

  const discountTokenMintStr = process.argv[4];
  const discountTokenMint = discountTokenMintStr
    ? new PublicKey(discountTokenMintStr)
    : null;

  if (isNaN(poolIdx0) || isNaN(poolIdx1)) {
    console.error("Please provide two valid pool indexes.");
    return;
  }

  const pool0 = await getWhirlPool(client, getPoolInfo(poolIdx0));
  const pool1 = await getWhirlPool(client, getPoolInfo(poolIdx1));

  await swapTwoHops(
    "two hops ",
    client,
    pool0,
    pool1,
    [0],
    [100],
    new BN(100000),
    newWallet,
    discountTokenMint,
    true
  );
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});

const swapTwoHops = async (
  testCase: string,
  client: WhirlpoolClient,
  pool0: Whirlpool,
  pool1: Whirlpool,
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
  const { tx } = await getTwoHopSwapIx(
    client,
    pool0,
    pool1,
    wallet,
    swapAmount,
    feeDiscountToken
  );

  // Extract the relevant lookup table addresses using the pool addresses
  const lookupTableData = loadLookupTable();
  const lookupTableAddress0 = lookupTableData[pool0.getAddress().toBase58()];
  const lookupTableAddress1 = lookupTableData[pool1.getAddress().toBase58()];

  // Check if lookup table addresses are found, otherwise handle the error or fallback
  if (!lookupTableAddress0 || !lookupTableAddress1) {
    console.error("Lookup table addresses for pools not found.");
    return;
  }

  let lookUpTables = [
    new PublicKey(lookupTableAddress0),
    new PublicKey(lookupTableAddress1),
  ];

  const compressedTx = tx.compressIx(true);
  const instructions = compressedTx.instructions;
  await compareTxSize(
    client.getContext().connection,
    walletKeypair,
    instructions,
    lookUpTables,
    compressedTx.signers
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

// utils function
