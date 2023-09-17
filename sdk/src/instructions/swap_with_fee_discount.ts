import { Instruction } from "@orca-so/common-sdk";
import { BN, Program } from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { Whirlpool } from "../artifacts/whirlpool";
import { SwapInput } from "./swap-ix";

/**
 * Raw parameters and accounts to swap on a Whirlpool
 *
 * @category Instruction Types
 * @param swapInput - Parameters in {@link SwapInput}
 * @param whirlpool - PublicKey for the whirlpool that the swap will occur on
 * @param tokenOwnerAccountA - PublicKey for the associated token account for tokenA in the collection wallet
 * @param tokenOwnerAccountB - PublicKey for the associated token account for tokenB in the collection wallet
 * @param tokenVaultA - PublicKey for the tokenA vault for this whirlpool.
 * @param tokenVaultB - PublicKey for the tokenB vault for this whirlpool.
 * @param oracle - PublicKey for the oracle account for this Whirlpool.
 * @param tokenAuthority - authority to withdraw tokens from the input token account
 */
export type SwapWithFeeDiscountParams = SwapInput & {
  whirlpool: PublicKey;
  tokenOwnerAccountA: PublicKey;
  tokenOwnerAccountB: PublicKey;
  tokenVaultA: PublicKey;
  tokenVaultB: PublicKey;
  oracle: PublicKey;
  tokenAuthority: PublicKey;
  whirlpoolDiscountInfo: PublicKey;
  discountToken: PublicKey;
  tokenDiscountOwnerAccount: PublicKey;
};

/**
 * Parameters to swap on a Whirlpool with developer fees
 *
 * @category Instruction Types
 * @param SwapWithFeeDiscountInput - Parameters in {@link SwapWithFeeDiscountInput}
 * @param devFeeAmount -  FeeAmount (developer fees) charged on this swap
 */
export type DevFeeSwapWithFeeDiscountInput = SwapInput & {
  devFeeAmount: u64;
};

/**
 * Perform a swap in this Whirlpool
 *
 * #### Special Errors
 * - `ZeroTradableAmount` - User provided parameter `amount` is 0.
 * - `InvalidSqrtPriceLimitDirection` - User provided parameter `sqrt_price_limit` does not match the direction of the trade.
 * - `SqrtPriceOutOfBounds` - User provided parameter `sqrt_price_limit` is over Whirlppool's max/min bounds for sqrt-price.
 * - `InvalidTickArraySequence` - User provided tick-arrays are not in sequential order required to proceed in this trade direction.
 * - `TickArraySequenceInvalidIndex` - The swap loop attempted to access an invalid array index during the query of the next initialized tick.
 * - `TickArrayIndexOutofBounds` - The swap loop attempted to access an invalid array index during tick crossing.
 * - `LiquidityOverflow` - Liquidity value overflowed 128bits during tick crossing.
 * - `InvalidTickSpacing` - The swap pool was initialized with tick-spacing of 0.
 *
 * ### Parameters
 * @category Instructions
 * @param context - Context object containing services required to generate the instruction
 * @param params - {@link SwapWithFeeDiscountParams}
 * @returns - Instruction to perform the action.
 */
export function swapWithFeeDiscountIx(
  program: Program<Whirlpool>,
  params: SwapWithFeeDiscountParams
): Instruction {
  const {
    amount,
    otherAmountThreshold,
    sqrtPriceLimit,
    amountSpecifiedIsInput,
    aToB,
    whirlpool,
    tokenAuthority,
    tokenOwnerAccountA,
    tokenVaultA,
    tokenOwnerAccountB,
    tokenVaultB,
    tickArray0,
    tickArray1,
    tickArray2,
    oracle,
    whirlpoolDiscountInfo,
    discountToken,
    tokenDiscountOwnerAccount,
  } = params;

  const ix = program.instruction.swapWithFeeDiscount(
    amount,
    otherAmountThreshold,
    sqrtPriceLimit,
    amountSpecifiedIsInput,
    aToB,
    {
      accounts: {
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenAuthority: tokenAuthority,
        whirlpool,
        tokenOwnerAccountA,
        tokenVaultA,
        tokenOwnerAccountB,
        tokenVaultB,
        tickArray0,
        tickArray1,
        tickArray2,
        oracle,
        whirlpoolDiscountInfo,
        discountToken,
        tokenDiscountOwnerAccount: tokenDiscountOwnerAccount,
      },
    }
  );

  return {
    instructions: [ix],
    cleanupInstructions: [],
    signers: [],
  };
}
