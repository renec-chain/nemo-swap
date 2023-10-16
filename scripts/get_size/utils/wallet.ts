import {
  AnchorProvider,
  BN,
  Provider,
  Wallet,
  web3,
} from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { PublicKey, Keypair, Connection, Transaction } from "@solana/web3.js";

export const fundSolAccount = async (connection: Connection, to: PublicKey) => {
  await connection.requestAirdrop(to, 1 * 10 ** 9);
};

export const genNewWallet = async (
  connection: Connection
): Promise<Keypair> => {
  const newKeypair = Keypair.generate();
  await fundSolAccount(connection, newKeypair.publicKey);
  return newKeypair;
};

export interface CustomWallet {
  signTransaction(tx: Transaction): Promise<Transaction>;
  signAllTransactions(txs: Transaction[]): Promise<Transaction[]>;
  publicKey: PublicKey;
  payer: Keypair;
}
