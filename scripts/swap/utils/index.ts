import { Address } from "@project-serum/anchor";
import { Whirlpool } from "@renec/redex-sdk";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { Instruction } from "@orca-so/common-sdk";
export const MEMO_V2_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

export * from "./gasless";
export * from "./wallet";
export * from "./token";
export * from "./pool";

export type TwoHopTokens = {
  pool1OtherToken: Address;
  pool2OtherToken: Address;
  intermidaryToken: Address;
};

export const getTwoHopSwapTokens = (
  pool1: Whirlpool,
  pool2: Whirlpool
): TwoHopTokens => {
  let intermediaryToken: Address | null = null;
  let pool1OtherToken: Address | null = null;
  let pool2OtherToken: Address | null = null;

  // Check for common tokens between the pools
  const commonTokens: string[] = [
    pool1.getData().tokenMintA.toString(),
    pool1.getData().tokenMintB.toString(),
  ].filter((token) =>
    [
      pool2.getData().tokenMintA.toString(),
      pool2.getData().tokenMintB.toString(),
    ].includes(token)
  );

  if (commonTokens.length !== 1) {
    throw new Error(
      "Pools do not have a common intermediary token or have multiple common tokens."
    );
  }

  intermediaryToken = commonTokens[0];

  // Find the other tokens from each pool
  pool1OtherToken =
    pool1.getData().tokenMintA.toString() === intermediaryToken
      ? pool1.getData().tokenMintB
      : pool1.getData().tokenMintA;
  pool2OtherToken =
    pool2.getData().tokenMintA.toString() === intermediaryToken
      ? pool2.getData().tokenMintB
      : pool2.getData().tokenMintA;

  return {
    pool1OtherToken,
    pool2OtherToken,
    intermidaryToken: intermediaryToken,
  };
};

export const getLogMemoIx = async (
  from: PublicKey,
  message: string
): Promise<Instruction> => {
  const transactionInstruction = new TransactionInstruction({
    keys: [{ pubkey: from, isSigner: true, isWritable: false }],
    data: Buffer.from(message),
    programId: new PublicKey(MEMO_V2_PROGRAM_ID),
  });

  let ix = {
    instructions: [transactionInstruction],
    cleanupInstructions: [],
    signers: [],
  };

  return ix;
};
