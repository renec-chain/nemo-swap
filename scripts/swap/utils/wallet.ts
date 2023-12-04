import { PublicKey, Keypair, Connection } from "@solana/web3.js";

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
