import { Instruction } from "@orca-so/common-sdk";
import { BN, Program } from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { Whirlpool } from "../artifacts/whirlpool";
import { TwoHopSwapParams } from "./two-hop-swap-ix";

/**
 * Parameters to execute a two-hop swap on a Whirlpool.
 *
 * @category Instruction Types
 * @param whirlpoolOne - PublicKey for the whirlpool that the swap-one will occur on
 * @param whirlpoolTwo - PublicKey for the whirlpool that the swap-two will occur on
 * @param tokenOwnerAccountOneA - PublicKey for the associated token account for tokenA in whirlpoolOne in the collection wallet
 * @param tokenOwnerAccountOneB - PublicKey for the associated token account for tokenB in whirlpoolOne in the collection wallet
 * @param tokenOwnerAccountTwoA - PublicKey for the associated token account for tokenA in whirlpoolTwo in the collection wallet
 * @param tokenOwnerAccountTwoB - PublicKey for the associated token account for tokenB in whirlpoolTwo in the collection wallet
 * @param tokenVaultOneA - PublicKey for the tokenA vault for whirlpoolOne.
 * @param tokenVaultOneB - PublicKey for the tokenB vault for whirlpoolOne.
 * @param tokenVaultTwoA - PublicKey for the tokenA vault for whirlpoolTwo.
 * @param tokenVaultTwoB - PublicKey for the tokenB vault for whirlpoolTwo.
 * @param oracleOne - PublicKey for the oracle account for this whirlpoolOne.
 * @param oracleTwo - PublicKey for the oracle account for this whirlpoolTwo.
 * @param tokenAuthority - authority to withdraw tokens from the input token account
 * @param swapInput - Parameters in {@link TwoHopSwapInput}
 */
export type TwoHopSwapWithFeeDiscountParams = TwoHopSwapParams & {
  discountToken: PublicKey;
  whirlpoolDiscountInfoOne: PublicKey;
  whirlpoolDiscountInfoTwo: PublicKey;
  discountTokenOwnerAccount: PublicKey;
};

export function twoHopSwapWithFeeDiscountIx(
  program: Program<Whirlpool>,
  params: TwoHopSwapWithFeeDiscountParams
): Instruction {
  const {
    amount,
    otherAmountThreshold,
    amountSpecifiedIsInput,
    aToBOne,
    aToBTwo,
    sqrtPriceLimitOne,
    sqrtPriceLimitTwo,
    whirlpoolOne,
    whirlpoolTwo,
    tokenAuthority,
    tokenOwnerAccountOneA,
    tokenVaultOneA,
    tokenOwnerAccountOneB,
    tokenVaultOneB,
    tokenOwnerAccountTwoA,
    tokenVaultTwoA,
    tokenOwnerAccountTwoB,
    tokenVaultTwoB,
    tickArrayOne0,
    tickArrayOne1,
    tickArrayOne2,
    tickArrayTwo0,
    tickArrayTwo1,
    tickArrayTwo2,
    oracleOne,
    oracleTwo,
    discountToken,
    whirlpoolDiscountInfoOne,
    whirlpoolDiscountInfoTwo,
    discountTokenOwnerAccount,
  } = params;

  const ix = program.instruction.twoHopSwapWithFeeDiscount(
    amount,
    otherAmountThreshold,
    amountSpecifiedIsInput,
    aToBOne,
    aToBTwo,
    sqrtPriceLimitOne,
    sqrtPriceLimitTwo,
    {
      accounts: {
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenAuthority,
        whirlpoolOne,
        whirlpoolTwo,
        tokenOwnerAccountOneA,
        tokenVaultOneA,
        tokenOwnerAccountOneB,
        tokenVaultOneB,
        tokenOwnerAccountTwoA,
        tokenVaultTwoA,
        tokenOwnerAccountTwoB,
        tokenVaultTwoB,
        tickArrayOne0,
        tickArrayOne1,
        tickArrayOne2,
        tickArrayTwo0,
        tickArrayTwo1,
        tickArrayTwo2,
        oracleOne,
        oracleTwo,
        discountToken,
        whirlpoolDiscountInfoOne,
        whirlpoolDiscountInfoTwo,
        discountTokenOwnerAccount,
      },
    }
  );

  return {
    instructions: [ix],
    cleanupInstructions: [],
    signers: [],
  };
}
