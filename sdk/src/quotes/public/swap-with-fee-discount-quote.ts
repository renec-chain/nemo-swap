import { AddressUtil, Percentage } from "@orca-so/common-sdk";
import { Address, BN } from "@project-serum/anchor";
import { u64 } from "@solana/spl-token";
import invariant from "tiny-invariant";
import { SwapInput } from "../../instructions";
import { AccountFetcher } from "../../network/public";
import { TickArray, WhirlpoolData, WhirlpoolDiscountInfoData } from "../../types/public";
import { PDAUtil, PoolUtil, SwapDirection, TokenType } from "../../utils/public";
import { SwapUtils } from "../../utils/public/swap-utils";
import { Whirlpool } from "../../whirlpool-client";
import { simulateSwap, simulateSwapWithFeeDiscount } from "../swap/swap-quote-impl";
import { NormalSwapQuote, SwapQuote, SwapQuoteParam } from "./swap-quote";
import { PublicKey } from "@solana/web3.js";

export type FeeDiscountSwapQuote = NormalSwapQuote & {
  estimatedDiscountAmount: u64;
  estimatedBurnAmount: u64;
};

/**
 * @category Quotes
 * @TODO additional function
 * @param whirlpool
 * @param inputTokenMint
 * @param tokenAmount
 * @param slippageTolerance
 * @param programId
 * @param fetcher
 * @param refresh
 * @returns
 */
export async function swapWithFeeDiscountQuoteByInputToken(
  whirlpool: Whirlpool,
  discountToken: PublicKey,
  inputTokenMint: Address,
  tokenAmount: u64,
  slippageTolerance: Percentage,
  programId: Address,
  fetcher: AccountFetcher,
  refresh: boolean
): Promise<FeeDiscountSwapQuote> {
  const whirlpoolDiscountInfoPubkey = PDAUtil.getWhirlpoolDiscountInfo(
    new PublicKey(programId),
    whirlpool.getAddress(),
    discountToken
  ).publicKey;

  const whirlpoolDiscountInfoData = await fetcher.getPoolDiscountInfo(whirlpoolDiscountInfoPubkey);
  if (!whirlpoolDiscountInfoData) {
    throw new Error("Whirlpool discount info does not exist");
  }

  const params = await swapQuoteByToken(
    whirlpool,
    inputTokenMint,
    tokenAmount,
    true,
    programId,
    fetcher,
    refresh
  );
  return swapWithFeeDiscountQuoteWithParams(params, whirlpoolDiscountInfoData, slippageTolerance);
}

export async function swapWithFeeDiscountQuoteByOutputToken(
  whirlpool: Whirlpool,
  whirlpoolDiscountInfoData: WhirlpoolDiscountInfoData,
  outputTokenMint: Address,
  tokenAmount: u64,
  slippageTolerance: Percentage,
  programId: Address,
  fetcher: AccountFetcher,
  refresh: boolean
): Promise<FeeDiscountSwapQuote> {
  const params = await swapQuoteByToken(
    whirlpool,
    outputTokenMint,
    tokenAmount,
    false,
    programId,
    fetcher,
    refresh
  );
  return swapWithFeeDiscountQuoteWithParams(params, whirlpoolDiscountInfoData, slippageTolerance);
}

/**
 * Get the token type of the input token for this swap quote.
 *
 * @category Quotes
 * @param quote - SwapQuote object
 * @returns the TokenType of the input token
 */
export function swapWithFeeDiscountQuoteWithParams(
  params: SwapQuoteParam,
  whirlpoolDiscountInfoData: WhirlpoolDiscountInfoData,
  slippageTolerance: Percentage
): FeeDiscountSwapQuote {
  const quote = simulateSwapWithFeeDiscount(params, whirlpoolDiscountInfoData);

  const slippageAdjustedQuote: FeeDiscountSwapQuote = {
    ...quote,
    ...SwapUtils.calculateSwapAmountsFromQuote(
      quote.amount,
      quote.estimatedAmountIn,
      quote.estimatedAmountOut,
      slippageTolerance,
      quote.amountSpecifiedIsInput
    ),
  };

  return slippageAdjustedQuote;
}

async function swapQuoteByToken(
  whirlpool: Whirlpool,
  inputTokenMint: Address,
  tokenAmount: u64,
  amountSpecifiedIsInput: boolean,
  programId: Address,
  fetcher: AccountFetcher,
  refresh: boolean
): Promise<SwapQuoteParam> {
  const whirlpoolData = whirlpool.getData();
  const swapMintKey = AddressUtil.toPubKey(inputTokenMint);
  const swapTokenType = PoolUtil.getTokenType(whirlpoolData, swapMintKey);
  invariant(!!swapTokenType, "swapTokenMint does not match any tokens on this pool");

  const aToB =
    SwapUtils.getSwapDirection(whirlpoolData, swapMintKey, amountSpecifiedIsInput) ===
    SwapDirection.AtoB;

  const tickArrays = await SwapUtils.getTickArrays(
    whirlpoolData.tickCurrentIndex,
    whirlpoolData.tickSpacing,
    aToB,
    AddressUtil.toPubKey(programId),
    whirlpool.getAddress(),
    fetcher,
    refresh
  );

  return {
    whirlpoolData,
    tokenAmount,
    aToB,
    amountSpecifiedIsInput,
    sqrtPriceLimit: SwapUtils.getDefaultSqrtPriceLimit(aToB),
    otherAmountThreshold: SwapUtils.getDefaultOtherAmountThreshold(amountSpecifiedIsInput),
    tickArrays,
  };
}
