import * as anchor from "@project-serum/anchor";

async function getProgramSignatures(
  connection: anchor.web3.Connection,
  programId: string,
  untilSignature?: string
): Promise<string[]> {
  const programIdPubKey = new anchor.web3.PublicKey(programId);
  const confirmedSignatureInfo =
    await connection.getConfirmedSignaturesForAddress2(
      programIdPubKey,
      { until: untilSignature },
      "finalized"
    );
  return confirmedSignatureInfo
    .filter((item) => item.err == null)
    .map((item) => item.signature);
}

async function getParsedPoolTransactions(
  connection: anchor.web3.Connection,
  batchSignatures: Array<string[]>
): Promise<(anchor.web3.ParsedTransactionWithMeta | null)[]> {
  const createPoolTransactions: (anchor.web3.ParsedTransactionWithMeta | null)[] =
    [];
  for (const batchSignature of batchSignatures) {
    const transactions = await connection.getParsedTransactions(batchSignature);
    const result = transactions.filter((transaction) => {
      if (!transaction || !transaction.meta || !transaction.meta.logMessages) {
        return false;
      }
      return transaction.meta.logMessages.includes(
        "Program log: Instruction: InitializePool"
      );
    });
    console.log("result: ", result)
    createPoolTransactions.push(...result);
  }
  return createPoolTransactions;
}

function splitTransactions(signatures: string[]): Array<string[]> {
  const batchSignatures: Array<string[]> = [];
  if (signatures.length < 10) {
    batchSignatures.push(signatures);
  } else {
    const chunkSize = 10;
    for (let i = 0; i < signatures.length; i += chunkSize) {
      const chunk = signatures.slice(i, i + chunkSize);
      batchSignatures.push(chunk);
    }
  }

  return batchSignatures;
}

async function main() {
  const isMainnet = false;
  const rpc = isMainnet
    ? "https://api-mainnet-beta.renec.foundation:8899/"
    : "https://api-testnet.renec.foundation:8899/";

  const programId = isMainnet
    ? ""
    : "7yyFRQehBQjdSpWYV93jWh4558YbWmc4ofbMWzKTPyJL";
  const connection = new anchor.web3.Connection(rpc);
  //

  const untilSignature = undefined
  const signatures = await getProgramSignatures(
    connection,
    programId,
    untilSignature
  );
  console.log(`Founded: ${signatures.length} signatures`)
  const batchSignatures = splitTransactions(signatures);
  const transactions = await getParsedPoolTransactions(
    connection,
    batchSignatures
  );

  console.log(`Pool transaction: ${transactions.length} transactions`)
  const newPoolAccounts: string[] = [];
  for (const transaction of transactions) {
    if (transaction) {
      transaction.meta?.innerInstructions?.forEach((item) => {
        item.instructions.forEach((item) => {
          // @ts-ignore
          const parsed = item.parsed;
          if (parsed.info.space == 654) {
            newPoolAccounts.push(parsed.info.newAccount);
          }
        });
      });
    }
  }

  console.log(newPoolAccounts);
  console.log(newPoolAccounts.length);
}

main();
