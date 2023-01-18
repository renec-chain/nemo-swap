import { Program } from "@project-serum/anchor";
import { Whirlpool } from "../artifacts/whirlpool";
import { Instruction } from "@orca-so/common-sdk";
import { PublicKey } from "@solana/web3.js";

/**
 * Parameters to set the pool creator authority in a WhirlpoolsConfig
 *
 * @category Instruction Types
 * @param whirlpoolsConfig - The public key for the WhirlpoolsConfig this pool is initialized in
 * @param poolCreatorAuthority - The current poolCreatorAuthority in the WhirlpoolsConfig
 * @param newPoolCreatorAuthority - The new poolCreatorAuthority in the WhirlpoolsConfig
 */
export type SetPoolCreatorAuthorityParams = {
  whirlpoolsConfig: PublicKey;
  poolCreatorAuthority: PublicKey;
  newPoolCreatorAuthority: PublicKey;
};

/**
 * Sets the fee authority for a WhirlpoolsConfig.
 * The fee authority can set the fee & protocol fee rate for individual pools or set the default fee rate for newly minted pools.
 * Only the current fee authority has permission to invoke this instruction.
 *
 * @category Instructions
 * @param context - Context object containing services required to generate the instruction
 * @param params - SetPoolCreatorAuthorityParams object
 * @returns - Instruction to perform the action.
 */
export function setPoolCreatorAuthorityIx(
  program: Program<Whirlpool>,
  params: SetPoolCreatorAuthorityParams
): Instruction {
  const { whirlpoolsConfig, poolCreatorAuthority, newPoolCreatorAuthority } = params;

  const ix = program.instruction.setPoolCreatorAuthority({
    accounts: {
      whirlpoolsConfig,
      poolCreatorAuthority,
      newPoolCreatorAuthority,
    },
  });

  return {
    instructions: [ix],
    cleanupInstructions: [],
    signers: [],
  };
}
