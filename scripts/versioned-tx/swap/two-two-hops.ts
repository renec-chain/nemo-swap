//todo: testing 5 hops
import { PublicKey, Keypair } from "@solana/web3.js";
import { Percentage, TransactionBuilder } from "@orca-so/common-sdk";
import {
  Whirlpool,
  WhirlpoolClient,
  buildWhirlpoolClient,
} from "@renec/redex-sdk";
import { loadProvider, loadWallets, ROLES } from "../../create_pool/utils";
import {
  getWhirlPool,
  createTokenAccountAndMintTo,
  getTwoHopSwapTokens,
  executeGaslessTx,
} from "../../swap/utils";
import { getPoolInfo } from "../../create_pool/utils/pool";

import {
  GaslessDapp,
  GaslessTransaction,
  Wallet,
} from "@renec-foundation/gasless-sdk";
import { BN } from "@project-serum/anchor";
import { VersionedTransactionBuilder } from "../utils/version";
import {
  createTokenAccounts,
  getTwoHopSwapIx,
  removeDuplicatedInstructions,
} from "./utils";
import { loadLookupTable } from "../utils/helper";
import { exec } from "mz/child_process";

async function main() {
  const wallets = loadWallets([ROLES.TEST]);
  const userAuth = wallets[ROLES.TEST];

  // Generate new wallets for testing
  const { ctx } = loadProvider(userAuth);
  const client = buildWhirlpoolClient(ctx);
  console.log("wallet:", userAuth.publicKey.toBase58());

  const renecUsdt32 = await getWhirlPool(client, getPoolInfo(0));
  const renecUsdt8 = await getWhirlPool(client, getPoolInfo(1));
  const revndRenec = await getWhirlPool(client, getPoolInfo(2));
  const asyReusd = await getWhirlPool(client, getPoolInfo(3));
  const revndReusd = await getWhirlPool(client, getPoolInfo(4));

  console.log("renecUsdt32:", renecUsdt32.getAddress().toBase58());
  console.log("renecUsdt8:", renecUsdt8.getAddress().toBase58());
  console.log("revndRenec:", revndRenec.getAddress().toBase58());
  console.log("asyReusd:", asyReusd.getAddress().toBase58());
  console.log("revndReusd:", revndReusd.getAddress().toBase58());

  const { tx: tx1, createdWrenecPubkey } = await swapTwoHops(
    "two hops ",
    client,
    revndRenec,
    renecUsdt32,
    [],
    [],
    new BN(10000),
    userAuth,
    null,
    null
  );

  const { tx: tx2 } = await swapTwoHops(
    "two hops ",
    client,
    revndRenec,
    renecUsdt8,
    [],
    [],
    new BN(10000),
    userAuth,
    null,
    createdWrenecPubkey
  );

  // Extract the relevant lookup table addresses using the pool addresses
  const lookupTableData = loadLookupTable();
  const lookupTableAddressRenecUsdt32 =
    lookupTableData[renecUsdt32.getAddress().toBase58()];
  const lookupTableAddressRenecUsdt8 =
    lookupTableData[renecUsdt8.getAddress().toBase58()];
  const lookupTableAddressRevndReusd =
    lookupTableData[revndReusd.getAddress().toBase58()];

  console.log("lookupTableAddressRenecUsdt32:", lookupTableAddressRenecUsdt32);
  console.log("lookupTableAddressRenecUsdt8:", lookupTableAddressRenecUsdt8);
  console.log("lookupTableAddressRevndReusd:", lookupTableAddressRevndReusd);

  // Check if lookup table addresses are found, otherwise handle the error or fallback
  if (
    !lookupTableAddressRenecUsdt32 ||
    !lookupTableAddressRenecUsdt8 ||
    !lookupTableAddressRevndReusd
  ) {
    console.error("Lookup table addresses for pools not found.");
    return;
  }

  let lookUpTables = [
    new PublicKey(lookupTableAddressRenecUsdt32),
    new PublicKey(lookupTableAddressRenecUsdt8),
    new PublicKey(lookupTableAddressRevndReusd),
  ];

  for (const lookupTable of lookUpTables) {
    console.log("Lookup table:", lookupTable.toBase58());
  }

  // Create v0Tx
  const connection = client.getContext().provider.connection;
  const tx = removeDuplicatedInstructions(
    connection,
    new Wallet(userAuth),
    tx1.addInstruction(tx2.compressIx(true))
  );

  // Get size
  const versionedTx = VersionedTransactionBuilder.fromTransactionBuilder(
    connection,
    userAuth,
    tx,
    lookUpTables
  );

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

  //process.exit(0);
  // Test gasless
  const dappUtil = await GaslessDapp.new(client.getContext().connection);
  const gaslessTx: GaslessTransaction = await GaslessTransaction.fromV0Tx(
    client.getContext().connection,
    new Wallet(userAuth),
    dappUtil,
    await versionedTx.build(),
    [userAuth]
  );

  console.log("\n Execute gasless tx...");
  const txId = await gaslessTx.buildAndExecute();
  console.log("Gasless tx id: ", txId);
  // const { puzzle, estHandlingTime } =
  //   await gaslessTx.getPuzzleAndEstimateTime();
  // try {
  //   const txId = await gaslessTx.solveAndSubmit(puzzle);
  //   console.log("txId:", txId);
  // } catch (e) {
  //   console.log(e);
  // }
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
  inputCreatedWrenecPubkey?: PublicKey
): Promise<{
  tx: TransactionBuilder;
  createdWrenecPubkey: PublicKey | undefined;
}> => {
  console.log("\n\n Test case: ", testCase);
  console.log(
    "Created input wrenec pubkey: ",
    inputCreatedWrenecPubkey?.toString() || "none  "
  );

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
  const { tx, createdWrenecPubkey } = await getTwoHopSwapIx(
    client,
    pool0,
    pool1,
    wallet,
    swapAmount,
    feeDiscountToken,
    inputCreatedWrenecPubkey
  );

  return { tx, createdWrenecPubkey };
};
