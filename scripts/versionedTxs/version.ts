import {
  AddressLookupTableProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  Signer,
} from "@solana/web3.js";
import { ROLES, loadProvider, loadWallets } from "../create_pool/utils";
import {
  PDAUtil,
  TickArrayUtil,
  Whirlpool,
  WhirlpoolContext,
} from "@renec/redex-sdk";
import { Wallet } from "@project-serum/anchor";
import { lookup } from "mz/dns";
import { getStartTicksWithOffset } from "../create_pool/utils/tickArrays";

export async function createAndSendV0Tx(
  connection: Connection,
  keypair: Keypair,
  txInstructions: TransactionInstruction[],
  signers?: Signer[]
): Promise<string> {
  // Step 1 - Fetch Latest Blockhash
  let latestBlockhash = await connection.getLatestBlockhash("finalized");
  console.log(
    "   ✅ - Fetched latest blockhash. Last valid height:",
    latestBlockhash.lastValidBlockHeight
  );

  // Step 2 - Generate Transaction Message
  const messageV0 = new TransactionMessage({
    payerKey: keypair.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: txInstructions,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(messageV0);

  // Step 3 - Sign your transaction with the required `Signers`
  // loop signers
  if (signers) {
    transaction.sign(signers);
  }

  transaction.sign([keypair]);

  // Step 4 - Send our v0 transaction to the cluster
  const txid = await connection.sendTransaction(transaction, {
    maxRetries: 5,
  });

  // Step 5 - Confirm Transaction
  const confirmation = await connection.confirmTransaction({
    signature: txid,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });
  if (confirmation.value.err) {
    throw new Error("   ❌ - Transaction not confirmed.");
  }

  return txid;
}

export async function createLookupTable(
  connection: Connection,
  keypair: Keypair
): Promise<PublicKey> {
  // Step 1 - Get a lookup table address and create lookup table instruction
  const [lookupTableInst, lookupTableAddress] =
    AddressLookupTableProgram.createLookupTable({
      authority: keypair.publicKey,
      payer: keypair.publicKey,
      recentSlot: await connection.getSlot(),
    });

  // Step 2 - Log Lookup Table Address
  console.log("Lookup Table Address:", lookupTableAddress.toBase58());

  // Step 3 - Generate a transaction and send it to the network
  createAndSendV0Tx(connection, keypair, [lookupTableInst]);

  return lookupTableAddress;
}

export async function addAddressesToTable(
  connection: Connection,
  authority: Keypair,
  lookupTable: PublicKey,
  addresses: PublicKey[]
): Promise<string> {
  // Step 1 - Create Transaction Instruction
  const addAddressesInstruction = AddressLookupTableProgram.extendLookupTable({
    payer: authority.publicKey,
    authority: authority.publicKey,
    lookupTable,
    addresses,
  });
  // Step 2 - Generate a transaction and send it to the network
  return await createAndSendV0Tx(connection, authority, [
    addAddressesInstruction,
  ]);
}

export async function findAddressesInTable(
  connection: Connection,
  lookupTableAddress: PublicKey
) {
  // Step 1 - Fetch our address lookup table
  const lookupTableAccount = await connection.getAddressLookupTable(
    lookupTableAddress
  );
  console.log(
    `Successfully found lookup table: `,
    lookupTableAccount.value?.key.toString()
  );

  // Step 2 - Make sure our search returns a valid table
  if (!lookupTableAccount.value) return;

  // Step 3 - Log each table address to console
  for (let i = 0; i < lookupTableAccount.value.state.addresses.length; i++) {
    const address = lookupTableAccount.value.state.addresses[i];
    console.log(`   Address ${i + 1}: ${address.toBase58()}`);
  }
}

export async function compareTxSize(
  connection: Connection,
  keypair: Keypair,
  lookupTableAddress: PublicKey
) {
  // Step 1 - Fetch the lookup table
  const lookupTable = (
    await connection.getAddressLookupTable(lookupTableAddress)
  ).value;
  if (!lookupTable) return;
  console.log("   ✅ - Fetched lookup table:", lookupTable.key.toString());

  // Step 2 - Generate an array of Solana transfer instruction to each address in our lookup table
  const txInstructions: TransactionInstruction[] = [];
  for (let i = 0; i < lookupTable.state.addresses.length; i++) {
    const address = lookupTable.state.addresses[i];
    txInstructions.push(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: address,
        lamports: 0.01 * LAMPORTS_PER_SOL,
      })
    );
  }

  // Step 3 - Fetch the latest Blockhash
  let latestBlockhash = await connection.getLatestBlockhash("finalized");
  console.log(
    "   ✅ - Fetched latest blockhash. Last valid height:",
    latestBlockhash.lastValidBlockHeight
  );

  // Step 4 - Generate and sign a transaction that uses a lookup table
  const messageWithLookupTable = new TransactionMessage({
    payerKey: keypair.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: txInstructions,
  }).compileToV0Message([lookupTable]); // 👈 NOTE: We DO include the lookup table
  const transactionWithLookupTable = new VersionedTransaction(
    messageWithLookupTable
  );
  transactionWithLookupTable.sign([keypair]);

  // Step 5 - Generate and sign a transaction that DOES NOT use a lookup table
  const messageWithoutLookupTable = new TransactionMessage({
    payerKey: keypair.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: txInstructions,
  }).compileToV0Message(); // 👈 NOTE: We do NOT include the lookup table
  const transactionWithoutLookupTable = new VersionedTransaction(
    messageWithoutLookupTable
  );
  transactionWithoutLookupTable.sign([keypair]);

  console.log("   ✅ - Compiled transactions");

  // Step 6 - Log our transaction size
  console.log(
    "Transaction size without address lookup table: ",
    transactionWithoutLookupTable.serialize().length,
    "bytes"
  );
  console.log(
    "Transaction size with address lookup table:    ",
    transactionWithLookupTable.serialize().length,
    "bytes"
  );
}

export async function createV0Tx(
  connection: Connection,
  wallet: Wallet,
  txInstructions: TransactionInstruction[],
  signers?: Signer[]
): Promise<VersionedTransaction> {
  // Step 1 - Fetch Latest Blockhash
  let latestBlockhash = await connection.getLatestBlockhash("finalized");
  console.log(
    "   ✅ - Fetched latest blockhash. Last valid height:",
    latestBlockhash.lastValidBlockHeight
  );

  // Step 2 - Generate Transaction Message
  const messageV0 = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: txInstructions,
  }).compileToV0Message();
  console.log("   ✅ - Compiled transaction message");
  const transaction = new VersionedTransaction(messageV0);

  // Step 3 - Sign your transaction with the required `Signers`
  // loop signers
  if (signers) {
    transaction.sign(signers);
  }

  return transaction;
}

export class WhirlpoolLookupTable {
  public static async createWhirlpoolLookupTable(
    whirlpool: Whirlpool,
    ctx: WhirlpoolContext,
    keypair: Keypair
  ): Promise<PublicKey> {
    const numOfSurroundingTickArrays = 5;
    const lut = await createLookupTable(ctx.connection, keypair);

    const poolData = whirlpool.getData();

    // What can be cached?
    const whirlpoolAddr = whirlpool.getAddress();

    const oraclePda = PDAUtil.getOracle(ctx.program.programId, whirlpoolAddr);
    let addresses = [
      whirlpool.getAddress(),
      poolData.tokenVaultA,
      poolData.tokenVaultB,
      oraclePda.publicKey,
    ];

    // all tick arrays
    const rightTickArrayStartTicks = getStartTicksWithOffset(
      poolData.tickCurrentIndex,
      poolData.tickSpacing,
      numOfSurroundingTickArrays,
      true
    );

    const leftTickArrayStartTicks = getStartTicksWithOffset(
      poolData.tickCurrentIndex + poolData.tickSpacing * 88,
      poolData.tickSpacing,
      numOfSurroundingTickArrays,
      false
    );

    const allStartTicks = leftTickArrayStartTicks.concat(
      rightTickArrayStartTicks
    );

    const initializedTickArrays = await getTickArrays(
      allStartTicks,
      ctx,
      whirlpoolAddr
    );

    initializedTickArrays.map((tickArray) =>
      console.log("tickArray: ", tickArray.address.toBase58())
    );

    addresses = addresses.concat(
      initializedTickArrays.map((tickArray) => tickArray.address)
    );

    addresses.map((address) => console.log("address: ", address.toBase58()));

    // Add addresses to lut
    const hash = await addAddressesToTable(
      ctx.connection,
      keypair,
      lut,
      addresses
    );

    return lut;
  }
}

export async function getTickArrays(
  startIndices: number[],
  ctx: WhirlpoolContext,
  whirlpoolKey: PublicKey
) {
  const tickArrayPdas = await startIndices.map((value) =>
    PDAUtil.getTickArray(ctx.program.programId, whirlpoolKey, value)
  );
  const tickArrayAddresses = tickArrayPdas.map((pda) => pda.publicKey);
  const tickArrays = await ctx.fetcher.listTickArrays(tickArrayAddresses, true);
  return tickArrayAddresses.map((addr, index) => {
    return {
      address: addr,
      data: tickArrays[index],
    };
  });
}
