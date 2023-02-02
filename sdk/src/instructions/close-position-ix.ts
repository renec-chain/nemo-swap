import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Instruction } from "@orca-so/common-sdk";
import { PublicKey } from "@solana/web3.js";
import { Program } from "@project-serum/anchor";
import { Whirlpool } from "../artifacts/whirlpool";

/**
 * Parameters to close a position in a Whirlpool.
 *
 * @category Instruction Types
 * @param whirlpool - PublicKey for the whirlpool that the position will be closed for.
 * @param receiver - PublicKey for the wallet that will receive the rented lamports.
 * @param position - PublicKey for the position.
 * @param positionMint - PublicKey for the mint token for the Position token.
 * @param positionTokenAccount - The associated token address for the position token in the owners wallet.
 * @param positionAuthority - Authority that owns the position token.
 */
export type ClosePositionParams = {
  whirlpool: PublicKey;
  receiver: PublicKey;
  position: PublicKey;
  positionMint: PublicKey;
  positionTokenAccount: PublicKey;
  positionAuthority: PublicKey;
};

/**
 * Close a position in a Whirlpool. Burns the position token in the owner's wallet.
 *
 * @category Instructions
 * @param context - Context object containing services required to generate the instruction
 * @param params - ClosePositionParams object
 * @returns - Instruction to perform the action.
 */
export function closePositionIx(
  program: Program<Whirlpool>,
  params: ClosePositionParams
): Instruction {
  const {
    whirlpool,
    positionAuthority,
    receiver: receiver,
    position: position,
    positionMint: positionMint,
    positionTokenAccount,
  } = params;

  const ix = program.instruction.closePosition({
    accounts: {
      whirlpool,
      positionAuthority,
      receiver,
      position,
      positionMint,
      positionTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
  });

  return {
    instructions: [ix],
    cleanupInstructions: [],
    signers: [],
  };
}
