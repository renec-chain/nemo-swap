import { AnchorProvider, BN, Provider, web3 } from "@project-serum/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  Token,
} from "@solana/spl-token";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";
import { deriveATA } from "@orca-so/common-sdk";
import { createAssociatedTokenInstructionData } from "@renec-foundation/gasless-sdk";

/**
 * Mints tokens to the specified destination token account.
 * @param provider An anchor AnchorProvider object used to send transactions
 * @param mint Mint address of the token
 * @param destination Destination token account to receive tokens
 * @param amount Number of tokens to mint
 */
export async function createTokenAccountAndMintTo(
  provider: AnchorProvider,
  mint: PublicKey,
  destination: PublicKey,
  amount: number
): Promise<string> {
  const tx = new web3.Transaction();

  if (mint.equals(new PublicKey(NATIVE_MINT))) {
    return "native token, skip";
  }

  const userTokenAccount = await deriveATA(destination, mint);
  const srcTokenAccount = await deriveATA(provider.wallet.publicKey, mint);

  tx.add(
    Token.createAssociatedTokenAccountInstruction(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      mint,
      userTokenAccount,
      destination,
      provider.wallet.publicKey
    )
  );

  if (amount > 0) {
    tx.add(
      Token.createTransferInstruction(
        TOKEN_PROGRAM_ID,
        srcTokenAccount,
        userTokenAccount,
        provider.wallet.publicKey,
        [],
        amount
      )
    );
  }

  return provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
}
