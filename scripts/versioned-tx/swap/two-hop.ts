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
import { VersionedTransactionBuilder, compareTxSize } from "../utils/version";
import {
  createTokenAccounts,
  getTwoHopSwapIx,
  removeDuplicatedInstructions,
} from "./utils";
import { loadLookupTable } from "../utils/helper";

//usage: 02_two_hop_swap <pool-idx-0> <pool-idx-1> <discount-token-mint | null>
async function main() {
  const wallets = loadWallets([ROLES.USER]);
  const userAuth = wallets[ROLES.USER];

  // Generate new wallets for testing
  const { ctx } = loadProvider(userAuth);
  const client = buildWhirlpoolClient(ctx);

  const wallet = new Wallet(userAuth);

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
    [],
    [],
    new BN(100000),
    userAuth,
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

  for (const lookupTable of lookUpTables) {
    console.log("Lookup table:", lookupTable.toBase58());
  }

  const connection = client.getContext().provider.connection;

  const transaction = removeDuplicatedInstructions(
    connection,
    new Wallet(walletKeypair),
    tx
  );

  const versionedTx = VersionedTransactionBuilder.fromTransactionBuilder(
    connection,
    walletKeypair,
    transaction,
    lookUpTables
  );

  // Get size
  console.log("--------");
  try {
    const size = await tx.txnSize();
    console.log("Legacy transaction size:", size);
  } catch (e) {
    console.log("Legacy transaction size error: ");
    console.log(e);
  }
  console.log("--------");

  const size = await versionedTx.txSize();
  console.log("V0 transaction size:", size);

  // Test gasless
  const dappUtil = await GaslessDapp.new(client.getContext().connection);
  const gaslessTx: GaslessTransaction = await GaslessTransaction.fromV0Tx(
    client.getContext().connection,
    new Wallet(walletKeypair),
    dappUtil,
    await versionedTx.build(),
    [walletKeypair]
  );

  const txId = await gaslessTx.buildAndExecute();
  console.log("Gasless tx id: ", txId);
};

// utils function
