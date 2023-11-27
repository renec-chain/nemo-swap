import { PublicKey, Transaction } from "@solana/web3.js";

import { AnchorProvider } from "@project-serum/anchor";
import { Token, TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";

export async function transfer(
  provider: AnchorProvider,
  source: PublicKey,
  destination: PublicKey,
  amount: number | u64
) {
  const tx = new Transaction();
  tx.add(
    Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      source,
      destination,
      provider.wallet.publicKey,
      [],
      amount
    )
  );
  return provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
}
