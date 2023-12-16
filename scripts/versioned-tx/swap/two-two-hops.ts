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

  const renecUsdt = await getWhirlPool(client, getPoolInfo(0));
  const renecAsy = await getWhirlPool(client, getPoolInfo(1));
  const renecRevnd = await getWhirlPool(client, getPoolInfo(2));
  const asyReusd = await getWhirlPool(client, getPoolInfo(3));
  const revndReusd = await getWhirlPool(client, getPoolInfo(4));

  console.log("renecUsdt:", renecUsdt.getAddress().toBase58());
  console.log("renecAsy:", renecAsy.getAddress().toBase58());
  console.log("renecRevnd:", renecRevnd.getAddress().toBase58());
  console.log("asyReusd:", asyReusd.getAddress().toBase58());
  console.log("revndReusd:", revndReusd.getAddress().toBase58());

  const tx1 = await swapTwoHops(
    "two hops ",
    client,
    renecAsy,
    asyReusd,
    [],
    [],
    new BN(10000000),
    userAuth,
    null,
    true
  );

  const tx2 = await swapTwoHops(
    "two hops ",
    client,
    renecRevnd,
    revndReusd,
    [],
    [],
    new BN(10000000),
    userAuth,
    null,
    true
  );

  // Extract the relevant lookup table addresses using the pool addresses
  const lookupTableData = loadLookupTable();
  const lookupTableAddressRenecAsy =
    lookupTableData[renecAsy.getAddress().toBase58()];
  const lookupTableAddressAsyReusd =
    lookupTableData[asyReusd.getAddress().toBase58()];
  const lookupTableAddressRenecRevnd =
    lookupTableData[renecRevnd.getAddress().toBase58()];
  const lookupTableAddressRevndReusd =
    lookupTableData[revndReusd.getAddress().toBase58()];

  // Check if lookup table addresses are found, otherwise handle the error or fallback
  if (
    !lookupTableAddressRenecAsy ||
    !lookupTableAddressAsyReusd ||
    !lookupTableAddressRenecRevnd ||
    !lookupTableAddressRevndReusd
  ) {
    console.error("Lookup table addresses for pools not found.");
    return;
  }

  let lookUpTables = [
    new PublicKey(lookupTableAddressRenecAsy),
    new PublicKey(lookupTableAddressAsyReusd),
    new PublicKey(lookupTableAddressRenecRevnd),
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

  // Test gasless
  const dappUtil = await GaslessDapp.new(client.getContext().connection);
  const gaslessTx: GaslessTransaction = await GaslessTransaction.fromV0Tx(
    client.getContext().connection,
    new Wallet(userAuth),
    dappUtil,
    await versionedTx.build(),
    []
  );

  await executeGaslessTx(gaslessTx, true);
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
  executeGasless = false
): Promise<TransactionBuilder> => {
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

  return tx;
};
