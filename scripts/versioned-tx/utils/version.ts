import {
  AddressLookupTableProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  Signer,
} from "@solana/web3.js";
import { TransactionBuilder } from "@orca-so/common-sdk";

export async function createAndSendV0Tx(
  connection: Connection,
  keypair: Keypair,
  txInstructions: TransactionInstruction[],
  signers?: Signer[]
): Promise<string> {
  // Fetch Latest Blockhash
  let latestBlockhash = await connection.getLatestBlockhash("finalized");

  // Generate Transaction Message
  const messageV0 = new TransactionMessage({
    payerKey: keypair.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: txInstructions,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(messageV0);

  // Sign your transaction with the required `Signers`
  if (signers) {
    transaction.sign(signers);
  }

  transaction.sign([keypair]);

  // Send our v0 transaction to the cluster
  const txid = await connection.sendTransaction(transaction, {
    maxRetries: 5,
  });

  // Confirm Transaction
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

  // Step 3 - Generate a transaction and send it to the network
  const tx = await createAndSendV0Tx(connection, keypair, [lookupTableInst]);
  console.log("tx success: ", tx);

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
  // Fetch our address lookup table
  const lookupTableAccount = await connection.getAddressLookupTable(
    lookupTableAddress
  );

  console.log(
    `Successfully found lookup table: `,
    lookupTableAccount.value?.key.toString()
  );

  // Make sure our search returns a valid table
  if (!lookupTableAccount.value) return;

  // Log each table address to console
  for (let i = 0; i < lookupTableAccount.value.state.addresses.length; i++) {
    const address = lookupTableAccount.value.state.addresses[i];
    console.log(`   Address ${i + 1}: ${address.toBase58()}`);
  }
}

export async function compareTxSize(
  connection: Connection,
  keypair: Keypair,
  transactionInstruction: TransactionInstruction[],
  lookupTableAddresses: PublicKey[],
  signers?: Signer[]
) {
  // Fetch the lookup tables
  const lookupTables = await Promise.all(
    lookupTableAddresses.map(async (addr) => {
      try {
        return (await connection.getAddressLookupTable(addr)).value;
      } catch (error) {
        console.error(
          "Error fetching lookup table for address:",
          addr.toBase58()
        );
        return null;
      }
    })
  );

  let latestBlockhash = await connection.getLatestBlockhash("finalized");

  // Generate and sign a transaction that uses a lookup table
  try {
    const messageWithLookupTable = new TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: transactionInstruction,
    }).compileToV0Message(lookupTables); // 👈 NOTE: We DO include the lookup table
    const transactionWithLookupTable = new VersionedTransaction(
      messageWithLookupTable
    );

    if (signers) {
      transactionWithLookupTable.sign(signers);
    }
    transactionWithLookupTable.sign([keypair]);

    console.log(
      "Transaction size with address lookup table:    ",
      transactionWithLookupTable.serialize().length,
      "bytes"
    );

    // // Step 4 - Send our v0 transaction to the cluster
    // console.log("--------------\n");
    // console.log("Sending transaction with lookup table...");
    // const txid = await connection.sendTransaction(transactionWithLookupTable, {
    //   maxRetries: 5,
    // });

    // // Step 5 - Confirm Transaction
    // const confirmation = await connection.confirmTransaction({
    //   signature: txid,
    //   blockhash: latestBlockhash.blockhash,
    //   lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    // });
    // if (confirmation.value.err) {
    //   throw new Error("   ❌ - Transaction not confirmed.");
    // }

    // console.log("tx id: ", txid);
    console.log("--------------\n");
  } catch (error) {
    console.error("Error creating transaction with lookup table: ", error);
    return;
  }

  try {
    // Generate and sign a transaction that DOES NOT use a lookup table
    const messageWithoutLookupTable = new TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: transactionInstruction,
    }).compileToV0Message(); // 👈 NOTE: We do NOT include the lookup table
    const transactionWithoutLookupTable = new VersionedTransaction(
      messageWithoutLookupTable
    );
    transactionWithoutLookupTable.sign([keypair]);
    console.log(
      "Transaction size without address lookup table: ",
      transactionWithoutLookupTable.serialize().length,
      "bytes"
    );
  } catch (error) {
    console.error("Error creating transaction without lookup table: ", error);
    return;
  }
}

export async function createV0Tx(
  connection: Connection,
  keypair: Keypair,
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
    payerKey: keypair.publicKey,
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

export async function createV0TxFromTransactionBuilder(
  connection: Connection,
  keypair: Keypair,
  tx: TransactionBuilder,
  lookupTableAddresses: PublicKey[]
): Promise<VersionedTransaction> {
  // Fetch the lookup tables
  const lookupTables = await Promise.all(
    lookupTableAddresses.map(async (addr) => {
      try {
        return (await connection.getAddressLookupTable(addr)).value;
      } catch (error) {
        console.error(
          "Error fetching lookup table for address:",
          addr.toBase58()
        );
        return null;
      }
    })
  );

  const txCompressed = tx.compressIx(true);
  const instructions = txCompressed.instructions;
  const signers = txCompressed.signers;

  let latestBlockhash = await connection.getLatestBlockhash("finalized");
  console.log(
    "   ✅ - Fetched latest blockhash. Last valid height:",
    latestBlockhash.lastValidBlockHeight
  );

  const message = new TransactionMessage({
    payerKey: keypair.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: instructions,
  }).compileToV0Message(lookupTables);
  console.log("   ✅ - Compiled transaction message");
  const transaction = new VersionedTransaction(message);

  transaction.sign(signers);

  return transaction;
}

export class VersionedTransactionBuilder {
  connection: Connection;
  private keypair: Keypair;
  instructions: TransactionInstruction[] = [];
  signers: Signer[] = [];
  lookupTableAddresses: PublicKey[];

  constructor(
    connection: Connection,
    keypair: Keypair,
    instructions: TransactionInstruction[],
    signers: Signer[],
    lookupTableAddresses: PublicKey[]
  ) {
    this.connection = connection;
    this.keypair = keypair;
    this.lookupTableAddresses = lookupTableAddresses;
    this.instructions = instructions;
    this.signers = signers;
  }

  public static fromTransactionBuilder(
    connection: Connection,
    keypair: Keypair,
    tx: TransactionBuilder,
    lookupTableAddresses: PublicKey[]
  ) {
    const compressedTx = tx.compressIx(true);
    return new VersionedTransactionBuilder(
      connection,
      keypair,
      compressedTx.instructions,
      compressedTx.signers,
      lookupTableAddresses
    );
  }

  public async txSize() {
    const latestBlockhash = await this.connection.getLatestBlockhash(
      "finalized"
    );

    // Fetch the lookup tables
    const lookupTables = await Promise.all(
      this.lookupTableAddresses.map(async (addr) => {
        try {
          return (await this.connection.getAddressLookupTable(addr)).value;
        } catch (error) {
          console.error(
            "Error fetching lookup table for address:",
            addr.toBase58()
          );
          return null;
        }
      })
    );

    const message = new TransactionMessage({
      payerKey: this.keypair.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: this.instructions,
    }).compileToV0Message(lookupTables);

    const transaction = new VersionedTransaction(message);
    if (this.signers) {
      transaction.sign(this.signers);
    }

    transaction.sign([this.keypair]);

    return transaction.serialize().length;
  }

  public async buildAndExecute() {
    const latestBlockhash = await this.connection.getLatestBlockhash(
      "finalized"
    );

    // Fetch the lookup tables
    const lookupTables = await Promise.all(
      this.lookupTableAddresses.map(async (addr) => {
        try {
          return (await this.connection.getAddressLookupTable(addr)).value;
        } catch (error) {
          console.error(
            "Error fetching lookup table for address:",
            addr.toBase58()
          );
          return null;
        }
      })
    );

    const message = new TransactionMessage({
      payerKey: this.keypair.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: this.instructions,
    }).compileToV0Message(lookupTables);

    const transaction = new VersionedTransaction(message);
    if (this.signers) {
      transaction.sign(this.signers);
    }

    transaction.sign([this.keypair]);

    // Send our v0 transaction to the cluster
    const txid = await this.connection.sendTransaction(transaction, {
      maxRetries: 5,
    });

    // Confirm Transaction
    const confirmation = await this.connection.confirmTransaction({
      signature: txid,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });

    if (confirmation.value.err) {
      throw new Error("   ❌ - Transaction not confirmed.");
    }

    return txid;
  }
}
