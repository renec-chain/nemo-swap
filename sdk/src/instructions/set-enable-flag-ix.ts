import { Program } from "@project-serum/anchor";
import { Whirlpool } from "../artifacts/whirlpool";
import { Instruction } from "@orca-so/common-sdk";
import { PublicKey } from "@solana/web3.js";

/**
 * Parameters to set enable flag for a Whirlpool.
 *
 * @category Instruction Types
 * @param whirlpool - PublicKey for the whirlpool to update. This whirlpool has to be part of the provided WhirlpoolsConfig space.
 * @param whirlpoolsConfig - The public key for the WhirlpoolsConfig this pool is initialized in
 * @param poolCreatorAuthority - Authority authorized in the WhirlpoolsConfig to set enable flag.
 * @param isEnabled - the pool is enabled when `isEnabled` is true.
 */
export type SetEnableFlagParams = {
  whirlpool: PublicKey;
  whirlpoolsConfig: PublicKey;
  poolCreatorAuthority: PublicKey;
  isEnabled: boolean;
};

/**
 * Sets `enable` flag of the pool to enable or disable this pool.
 * Only the current pool creator authority has permission to invoke this instruction.
 *
 * @category Instructions
 * @param context - Context object containing services required to generate the instruction
 * @param params - SetEnableFlagParams object
 * @returns - Instruction to perform the action.
 */
export function setEnableFlagIx(program: Program<Whirlpool>, params: SetEnableFlagParams): Instruction {
  const { whirlpoolsConfig, whirlpool, poolCreatorAuthority, isEnabled } = params;

  const ix = program.instruction.setEnableFlag(isEnabled, {
    accounts: {
      whirlpoolsConfig,
      whirlpool,
      poolCreatorAuthority,
    },
  });

  return {
    instructions: [ix],
    cleanupInstructions: [],
    signers: [],
  };
}
