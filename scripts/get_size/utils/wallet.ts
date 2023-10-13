import {
  AnchorProvider,
  BN,
  Provider,
  Wallet,
  web3,
} from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";

export const fundSolAccount = async (connection: Connection, to: PublicKey) => {
  await connection.requestAirdrop(to, 1 * 10 ** 9);
};

export const genNewWallet = async (connection: Connection): Promise<Wallet> => {
  const newKeypair = Keypair.generate();
  await fundSolAccount(connection, newKeypair.publicKey);
  return new Wallet(newKeypair);
};
