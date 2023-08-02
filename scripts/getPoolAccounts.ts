import * as anchor from "@project-serum/anchor";

/**
 * Get all program's signature until specify signature
 * @param connection
 * @param programId
 * @param untilSignature :  until signature if undefined it will get max 1000 latest signature
 * @returns list string signature
 */
async function getUntilProgramSignatures(
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

/**
 * Get all signature from before signature to oldest signature or 1000 signatures from this.
 * @param connection
 * @param programId
 * @param beforeSignature
 * @returns list string signature
 */
async function getBeforeProgramSignatures(
  connection: anchor.web3.Connection,
  programId: string,
  beforeSignature: string,
  untilSignature?: string
): Promise<string[]> {
  const programIdPubKey = new anchor.web3.PublicKey(programId);
  const confirmedSignatureInfo =
    await connection.getConfirmedSignaturesForAddress2(
      programIdPubKey,
      { before: beforeSignature, until: untilSignature },
      "finalized"
    );
  return confirmedSignatureInfo
    .filter((item) => item.err == null)
    .map((item) => item.signature);
}

/**
 *
 * @param connection
 * @param programId
 * @param untilSignature  if until signature not provide. This function will get all signatures executed by program
 *                     otherwise get all signature until provided signature
 * @returns
 */
async function getProgramSignatures(
  connection: anchor.web3.Connection,
  programId: string,
  untilSignature?: string
) {
  const signatures: string[] = [];
  let beforeSignature: string | undefined;
  while (true) {
    if (!beforeSignature) {
      const untilSignaturesData = await getUntilProgramSignatures(
        connection,
        programId,
        untilSignature
      );
      signatures.push(...untilSignaturesData);

      if (untilSignaturesData.length < 1000) {
        break;
      } else {
        beforeSignature = untilSignaturesData[untilSignaturesData.length - 1];
      }
    }

    const beforeSignatureData = await getBeforeProgramSignatures(
      connection,
      programId,
      beforeSignature,
      untilSignature
    );
    if (!beforeSignatureData.length) {
      break;
    }
    signatures.push(...beforeSignatureData);
    beforeSignature = beforeSignatureData[beforeSignatureData.length - 1];
  }

  return signatures;
}

/**
 *  Logic parsed transaction to detect create pool transaction
 * @param connection
 * @param batchSignatures
 * @returns list create pool transaction
 */
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
    createPoolTransactions.push(...result);
  }
  return createPoolTransactions;
}

/**
 * Because limitation of number of account to request get info. We have to split into subarray.
 * @param signatures
 * @returns list batch signatures
 */
function splitTransactions(
  signatures: string[],
  chunkSize = 10
): Array<string[]> {
  const batchSignatures: Array<string[]> = [];
  if (signatures.length < chunkSize) {
    batchSignatures.push(signatures);
  } else {
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
    : "4ERwQLtitCdCvSqjzrrVUTeZNfisLNuo3J8HVrbo6mn6";
  const connection = new anchor.web3.Connection(rpc);
  //

  const untilSignature =
    "3dGC1zLoyhzzp1uZjzcFkEcmrzoG3J5EbZj4M6XJPDc8K8ym9C2nrmJbGmxgjVgyZterQrqudHfGV16U1TKENj6d";

  // get all signature
  // if first time fetch program signature. `untilSignature` param will set undefined
  // In this case, it will fetch all transaction executed by program and parsed to get all pool account created
  // In some common case. We already get a lot of signatures to get pool account
  // In this case. We have to provide `untilSignature` to fetch all new signature and detect new pool create.
  const signatures = await getProgramSignatures(
    connection,
    programId,
    untilSignature
  );
  console.log(`Founded: ${signatures.length} signatures`);

  // split huge signatures into batch of sub array
  const batchSignatures = splitTransactions(signatures);

  // get and detect create pool transaction
  const transactions = await getParsedPoolTransactions(
    connection,
    batchSignatures
  );
  console.log(`Pool transaction: ${transactions.length} transactions`);

  // Logic handle parsing create pool transaction to get pool account
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
