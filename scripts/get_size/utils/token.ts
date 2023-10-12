import { AnchorProvider, BN, Provider, web3 } from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";

/**
 * Mints tokens to the specified destination token account.
 * @param provider An anchor AnchorProvider object used to send transactions
 * @param mint Mint address of the token
 * @param destination Destination token account to receive tokens
 * @param amount Number of tokens to mint
 */
export async function mintToByAuthority(
  provider: AnchorProvider,
  authority: Keypair,
  mint: PublicKey,
  destination: PublicKey,
  amount: number | BN
): Promise<string> {
  const tx = new web3.Transaction();
  tx.add(
    Token.createMintToInstruction(
      TOKEN_PROGRAM_ID,
      mint,
      destination,
      authority.publicKey,
      [],
      amount
    )
  );
  return provider.sendAndConfirm(tx, [authority], { commitment: "confirmed" });
}
