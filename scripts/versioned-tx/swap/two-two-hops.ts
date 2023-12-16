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
  genNewWallet,
  getWhirlPool,
  createTokenAccountAndMintTo,
  executeGaslessTx,
  getTwoHopSwapTokens,
} from "../../swap/utils";
import { getPoolInfo } from "../../create_pool/utils/pool";

import { Wallet } from "@renec-foundation/gasless-sdk";
import { Address, BN } from "@project-serum/anchor";
import {
  VersionedTransactionBuilder,
  compareTxSize,
  createV0TxFromTransactionBuilder,
} from "../utils/version";
import {
  createTokenAccounts,
  getTwoHopSwapIx,
  removeDuplicatedInstructions,
} from "./utils";
import { loadLookupTable } from "../utils/helper";

//usage: 02_two_hop_swap <pool-idx-0> <pool-idx-1> <discount-token-mint | null>

// TODO:
// Add rent account to address lookup table
//
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
  const renecRengn = await getWhirlPool(client, getPoolInfo(5));
  const rengnReusd = await getWhirlPool(client, getPoolInfo(6));

  console.log("renecUsdt:", renecUsdt.getAddress().toBase58());
  console.log("renecAsy:", renecAsy.getAddress().toBase58());
  console.log("renecRevnd:", renecRevnd.getAddress().toBase58());
  console.log("asyReusd:", asyReusd.getAddress().toBase58());
  console.log("revndReusd:", revndReusd.getAddress().toBase58());
  console.log("renecRengn:", renecRengn.getAddress().toBase58());
  console.log("rengnReusd:", rengnReusd.getAddress().toBase58());

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

  const lookupTableAddressRenecRengn =
    lookupTableData[renecRengn.getAddress().toBase58()];

  // Check if lookup table addresses are found, otherwise handle the error or fallback
  if (
    !lookupTableAddressRenecAsy ||
    !lookupTableAddressAsyReusd ||
    !lookupTableAddressRenecRevnd ||
    !lookupTableAddressRevndReusd ||
    !lookupTableAddressRenecRengn
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

  const size = await versionedTx.txSize();
  console.log("size:", size);

  // const txId = await versionedTx.buildAndExecute();
  // console.log("txId:", txId);
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

// utils function
