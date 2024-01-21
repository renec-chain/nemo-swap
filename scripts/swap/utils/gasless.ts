import { Address } from "@project-serum/anchor";
import { PoolInfo } from "../../create_pool/utils/types";
import { GaslessTransaction } from "@renec-foundation/gasless-sdk";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { Whirlpool } from "@renec/redex-sdk";
import { Instruction } from "@orca-so/common-sdk";
export const executeGaslessTx = async (
  gaslessTxn: GaslessTransaction,
  execute: boolean
) => {
  if (!execute) {
    const transaction = await gaslessTxn.build();

    try {
      const txSize = transaction.serialize({
        verifySignatures: false,
        requireAllSignatures: false,
      }).length;

      console.log("tx size: ", txSize);
    } catch (e) {
      console.log("gasless tx fail: ", e);
    }
  } else {
    try {
      console.log("---> Executing gasless transaction...");
      const tx = await gaslessTxn.buildAndExecute();
      console.log("gasless tx hash: ", tx);
    } catch (e) {
      console.log("execute gasless tx fail: ", e);
    }
  }
};
