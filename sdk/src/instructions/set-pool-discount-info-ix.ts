import { SystemProgram, PublicKey } from "@solana/web3.js";
import { BN, Program } from "@project-serum/anchor";
import { Whirlpool } from "../artifacts/whirlpool";
import { PDA } from "@orca-so/common-sdk";

import { Instruction } from "@orca-so/common-sdk";

export type SetPoolDiscountInfoParam = {
  whirlpoolsConfig: PublicKey;
  whirlpool: PublicKey;
  discountToken: PublicKey;
  whirlpoolDiscountInfoPDA: PDA;
  poolCreatorAuthority: PublicKey;
  tokenConversionRate: number;
  discountFeeRate: number;
  expo: number;
  discountTokenRateOverTokenA: BN;
};

export function setPoolDiscountInfoIx(
  program: Program<Whirlpool>,
  params: SetPoolDiscountInfoParam
): Instruction {
  const {
    whirlpoolsConfig,
    whirlpool,
    discountToken,
    poolCreatorAuthority,
    tokenConversionRate,
    whirlpoolDiscountInfoPDA,
    discountFeeRate,
    expo,
    discountTokenRateOverTokenA,
  } = params;

  const ix = program.instruction.setPoolDiscountInfo(
    tokenConversionRate,
    discountFeeRate,
    expo,
    discountTokenRateOverTokenA,
    {
      accounts: {
        config: whirlpoolsConfig,
        whirlpool: whirlpool,
        discountToken,
        whirlpoolDiscountInfo: whirlpoolDiscountInfoPDA.publicKey,
        poolCreatorAuthority,
        systemProgram: SystemProgram.programId,
      },
    }
  );

  return {
    instructions: [ix],
    cleanupInstructions: [],
    signers: [],
  };
}
