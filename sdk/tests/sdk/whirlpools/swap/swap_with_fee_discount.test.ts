import { MathUtil, Percentage, deriveATA } from "@orca-so/common-sdk";
import * as anchor from "@project-serum/anchor";
import { web3 } from "@project-serum/anchor";
import { u64 } from "@solana/spl-token";
import * as assert from "assert";
import { BN } from "bn.js";
import Decimal from "decimal.js";
import {
  buildWhirlpoolClient,
  PDAUtil,
  PriceMath,
  swapQuoteByInputToken,
  toTx,
  WhirlpoolContext,
  WhirlpoolIx,
  swapWithFeeDiscountQuoteByInputToken,
  Whirlpool,
  swapWithFeeDiscountQuoteByOutputToken,
  swapQuoteByOutputToken,
} from "../../../../src";
import {
  assertQuoteAndResults,
  createAndMintToAssociatedTokenAccount,
  createMint,
  getTokenBalance,
  initializePoolDiscountInfo,
  TickSpacing,
} from "../../../utils";

import { getVaultAmounts } from "../../../utils/whirlpools-test-utils";
import {
  arrayTickIndexToTickIndex,
  buildPosition,
  setupSwapTest,
} from "../../../utils/swap-test-utils";
import { PublicKey, Signer } from "@solana/web3.js";

describe("swap_with_fee_discount", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.Whirlpool;
  const ctx = WhirlpoolContext.fromWorkspace(provider, program);
  const fetcher = ctx.fetcher;
  const client = buildWhirlpoolClient(ctx);
  const slippageTolerance = Percentage.fromFraction(0, 100);
  const tickSpacing = TickSpacing.SixtyFour;
  const DEFAULT_FEE_RATE = new anchor.BN(3000);
  const DENOMINATOR = new anchor.BN(1000000);

  const TOKEN_CONVERSION_FEE_RATE = 4000; // 40%
  const DISCOUNT_FEE_RATE = 5000; // 50% of token conversion rate
  const DISCOUNT_FEE_RATE_MUL_VALUE = 10000;

  it("swap aToB && exact in", async () => {
    const currIndex = arrayTickIndexToTickIndex({ arrayIndex: -1, offsetIndex: 22 }, tickSpacing);
    const aToB = true;
    const whirlpool = await setupSwapTest({
      ctx,
      client,
      tickSpacing,
      initSqrtPrice: PriceMath.tickIndexToSqrtPriceX64(currIndex),
      initArrayStartTicks: [-5632, 0, 5632],
      fundedPositions: [
        buildPosition(
          // a
          { arrayIndex: -1, offsetIndex: 10 },
          { arrayIndex: 1, offsetIndex: 23 },
          tickSpacing,
          new anchor.BN(250_000_000)
        ),
      ],
    });

    // Setup whirlpool discount info
    const discountTokenMint = await createMint(provider);

    await createAndMintToAssociatedTokenAccount(
      ctx.provider,
      discountTokenMint,
      new anchor.BN(10000000)
    );

    const whirlpoolData = await whirlpool.refreshData();

    const whirlpoolDiscountInfoPubkey = await initializePoolDiscountInfo(
      ctx,
      whirlpool,
      discountTokenMint,
      TOKEN_CONVERSION_FEE_RATE,
      DISCOUNT_FEE_RATE,
      new anchor.BN(2)
    );

    // compute swap ix
    const inputTokenAmount = new u64(1195000);
    const swapToken = aToB ? whirlpoolData.tokenMintA : whirlpoolData.tokenMintB;

    const beforeVaultAmounts = await getVaultAmounts(ctx, whirlpoolData);

    const beforeUserTokenAAmount = await getTokenBalance(
      provider,
      await deriveATA(provider.wallet.publicKey, whirlpoolData.tokenMintA)
    );
    const beforeUserTokenBAmount = await getTokenBalance(
      provider,
      await deriveATA(provider.wallet.publicKey, whirlpoolData.tokenMintB)
    );

    const whirlpooDiscountInfoData = await ctx.fetcher.getPoolDiscountInfo(
      whirlpoolDiscountInfoPubkey
    );

    assert.ok(whirlpooDiscountInfoData != null);

    const quoteWithDiscount = await swapWithFeeDiscountQuoteByInputToken(
      whirlpool,
      whirlpooDiscountInfoData,
      swapToken,
      inputTokenAmount,
      slippageTolerance,
      ctx.program.programId,
      ctx.fetcher,
      true
    );

    const normalQuote = await swapQuoteByInputToken(
      whirlpool,
      swapToken,
      inputTokenAmount,
      slippageTolerance,
      ctx.program.programId,
      ctx.fetcher,
      true
    );

    // swap with fee discount
    await (
      await whirlpool.swapWithFeeDiscount(quoteWithDiscount, discountTokenMint)
    ).buildAndExecute();
    const afterVaultAmounts = await getVaultAmounts(ctx, whirlpoolData);
    const newData = await whirlpool.refreshData();

    // Assert sdk simulate function run correctly
    assertQuoteAndResults(aToB, quoteWithDiscount, newData, beforeVaultAmounts, afterVaultAmounts);

    // Assert user token balance
    const afterUserTokenAAmount = await getTokenBalance(
      provider,
      await deriveATA(provider.wallet.publicKey, whirlpoolData.tokenMintA)
    );
    const afterUserTokenBAmount = await getTokenBalance(
      provider,
      await deriveATA(provider.wallet.publicKey, whirlpoolData.tokenMintB)
    );

    assert.equal(
      new BN(beforeUserTokenAAmount).sub(new BN(afterUserTokenAAmount)).toNumber(),
      quoteWithDiscount.estimatedAmountIn
    );

    assert.equal(
      new BN(afterUserTokenBAmount).sub(new BN(beforeUserTokenBAmount)).toNumber(),
      quoteWithDiscount.estimatedAmountOut
    );

    // Assert that an tokenConversionFeeRate amount of fee is converted
    assert.ok(
      isApproxEqual(
        quoteWithDiscount.estimatedAmountOut,
        normalQuote.estimatedAmountOut,
        quoteWithDiscount.estimatedAmountOut
          .mul(DEFAULT_FEE_RATE)
          .div(DENOMINATOR)
          .mul(new BN(whirlpooDiscountInfoData.tokenConversionFeeRate))
          .div(new BN(DISCOUNT_FEE_RATE_MUL_VALUE))
      )
    );
  });

  it("swap bToA && exact in", async () => {
    const currIndex = arrayTickIndexToTickIndex({ arrayIndex: -1, offsetIndex: 22 }, tickSpacing);
    const aToB = false;
    const whirlpool = await setupSwapTest({
      ctx,
      client,
      tickSpacing,
      initSqrtPrice: PriceMath.tickIndexToSqrtPriceX64(currIndex),
      initArrayStartTicks: [-5632, 0, 5632],
      fundedPositions: [
        buildPosition(
          // a
          { arrayIndex: -1, offsetIndex: 10 },
          { arrayIndex: 1, offsetIndex: 23 },
          tickSpacing,
          new anchor.BN(250_000_000)
        ),
      ],
    });

    // Setup whirlpool discount info
    const discountTokenMint = await createMint(provider);
    await createAndMintToAssociatedTokenAccount(
      ctx.provider,
      discountTokenMint,
      new anchor.BN(10000000)
    );

    const whirlpoolData = await whirlpool.refreshData();

    const whirlpoolDiscountInfoPubkey = await initializePoolDiscountInfo(
      ctx,
      whirlpool,
      discountTokenMint,
      TOKEN_CONVERSION_FEE_RATE,
      DISCOUNT_FEE_RATE,
      new anchor.BN(1)
    );

    // Compute swap ix
    const inputTokenAmount = new u64(1195000);
    const swapToken = aToB ? whirlpoolData.tokenMintA : whirlpoolData.tokenMintB;
    const beforeVaultAmounts = await getVaultAmounts(ctx, whirlpoolData);
    const beforeUserTokenAAmount = await getTokenBalance(
      provider,
      await deriveATA(provider.wallet.publicKey, whirlpoolData.tokenMintA)
    );
    const beforeUserTokenBAmount = await getTokenBalance(
      provider,
      await deriveATA(provider.wallet.publicKey, whirlpoolData.tokenMintB)
    );

    const whirlpooDiscountInfoData = await ctx.fetcher.getPoolDiscountInfo(
      whirlpoolDiscountInfoPubkey
    );

    assert.ok(whirlpooDiscountInfoData != null);

    const quoteWithDiscount = await swapWithFeeDiscountQuoteByInputToken(
      whirlpool,
      whirlpooDiscountInfoData,
      swapToken,
      inputTokenAmount,
      slippageTolerance,
      ctx.program.programId,
      ctx.fetcher,
      true
    );

    const normalQuote = await swapQuoteByInputToken(
      whirlpool,
      swapToken,
      inputTokenAmount,
      slippageTolerance,
      ctx.program.programId,
      ctx.fetcher,
      true
    );

    // Swap with fee discount
    await (
      await whirlpool.swapWithFeeDiscount(quoteWithDiscount, discountTokenMint)
    ).buildAndExecute();

    const afterVaultAmounts = await getVaultAmounts(ctx, whirlpoolData);
    const newData = await whirlpool.refreshData();

    // Assert sdk simulate function run correctly
    assertQuoteAndResults(aToB, quoteWithDiscount, newData, beforeVaultAmounts, afterVaultAmounts);

    // Assert user token balance
    const afterUserTokenAAmount = await getTokenBalance(
      provider,
      await deriveATA(provider.wallet.publicKey, whirlpoolData.tokenMintA)
    );
    const afterUserTokenBAmount = await getTokenBalance(
      provider,
      await deriveATA(provider.wallet.publicKey, whirlpoolData.tokenMintB)
    );

    assert.equal(
      new BN(afterUserTokenAAmount).sub(new BN(beforeUserTokenAAmount)).toNumber(),
      quoteWithDiscount.estimatedAmountOut
    );

    assert.equal(
      new BN(beforeUserTokenBAmount).sub(new BN(afterUserTokenBAmount)).toNumber(),
      quoteWithDiscount.estimatedAmountIn
    );

    // Assert that user the amount user receive
    assert.ok(
      isApproxEqual(
        quoteWithDiscount.estimatedAmountOut,
        normalQuote.estimatedAmountOut,
        quoteWithDiscount.estimatedAmountOut
          .mul(DEFAULT_FEE_RATE)
          .div(DENOMINATOR)
          .mul(new BN(whirlpooDiscountInfoData.tokenConversionFeeRate))
          .div(new BN(DISCOUNT_FEE_RATE_MUL_VALUE))
      )
    );
  });

  it("swap bToA && exact out", async () => {
    const currIndex = arrayTickIndexToTickIndex({ arrayIndex: -1, offsetIndex: 22 }, tickSpacing);
    const aToB = false;
    const whirlpool = await setupSwapTest({
      ctx,
      client,
      tickSpacing,
      initSqrtPrice: PriceMath.tickIndexToSqrtPriceX64(currIndex),
      initArrayStartTicks: [-5632, 0, 5632],
      fundedPositions: [
        buildPosition(
          // a
          { arrayIndex: -1, offsetIndex: 10 },
          { arrayIndex: 1, offsetIndex: 23 },
          tickSpacing,
          new anchor.BN(250_000_000)
        ),
      ],
    });

    // Setup whirlpool discount info
    const discountTokenMint = await createMint(provider);

    await createAndMintToAssociatedTokenAccount(
      ctx.provider,
      discountTokenMint,
      new anchor.BN(10000000)
    );

    const whirlpoolData = await whirlpool.refreshData();

    const whirlpoolDiscountInfoPubkey = await initializePoolDiscountInfo(
      ctx,
      whirlpool,
      discountTokenMint,
      TOKEN_CONVERSION_FEE_RATE,
      DISCOUNT_FEE_RATE,
      new anchor.BN(2)
    );

    // compute swap ix
    const outputTokenAmount = new u64(1195000);
    const swapToken = aToB ? whirlpoolData.tokenMintB : whirlpoolData.tokenMintA;

    const beforeVaultAmounts = await getVaultAmounts(ctx, whirlpoolData);

    const beforeUserTokenAAmount = await getTokenBalance(
      provider,
      await deriveATA(provider.wallet.publicKey, whirlpoolData.tokenMintA)
    );
    const beforeUserTokenBAmount = await getTokenBalance(
      provider,
      await deriveATA(provider.wallet.publicKey, whirlpoolData.tokenMintB)
    );

    const whirlpooDiscountInfoData = await ctx.fetcher.getPoolDiscountInfo(
      whirlpoolDiscountInfoPubkey
    );

    assert.ok(whirlpooDiscountInfoData != null);

    const quoteWithDiscount = await swapWithFeeDiscountQuoteByOutputToken(
      whirlpool,
      whirlpooDiscountInfoData,
      swapToken,
      outputTokenAmount,
      slippageTolerance,
      ctx.program.programId,
      ctx.fetcher,
      true
    );

    const normalQuote = await swapQuoteByOutputToken(
      whirlpool,
      swapToken,
      outputTokenAmount,
      slippageTolerance,
      ctx.program.programId,
      ctx.fetcher,
      true
    );

    // swap with fee discount
    await (
      await whirlpool.swapWithFeeDiscount(quoteWithDiscount, discountTokenMint)
    ).buildAndExecute();
    const afterVaultAmounts = await getVaultAmounts(ctx, whirlpoolData);
    const newData = await whirlpool.refreshData();

    // Assert sdk simulate function run correctly
    assertQuoteAndResults(aToB, quoteWithDiscount, newData, beforeVaultAmounts, afterVaultAmounts);

    // Assert user token balance | exact out - aToB == false
    const afterUserTokenAAmount = await getTokenBalance(
      provider,
      await deriveATA(provider.wallet.publicKey, whirlpoolData.tokenMintA)
    );
    const afterUserTokenBAmount = await getTokenBalance(
      provider,
      await deriveATA(provider.wallet.publicKey, whirlpoolData.tokenMintB)
    );

    assert.equal(
      new BN(afterUserTokenAAmount).sub(new BN(beforeUserTokenAAmount)).toNumber(),
      quoteWithDiscount.estimatedAmountOut.toNumber()
    );

    assert.equal(
      new BN(beforeUserTokenBAmount).sub(new BN(afterUserTokenBAmount)).toNumber(),
      quoteWithDiscount.estimatedAmountIn.toNumber()
    );

    // Amount take in is lesser than normal quote
    assert.ok(
      isApproxEqual(
        normalQuote.estimatedAmountIn,
        quoteWithDiscount.estimatedAmountIn,
        quoteWithDiscount.estimatedAmountIn
          .mul(DEFAULT_FEE_RATE)
          .div(DENOMINATOR)
          .mul(new BN(whirlpooDiscountInfoData.tokenConversionFeeRate))
          .div(new BN(DISCOUNT_FEE_RATE_MUL_VALUE))
      )
    );
  });

  it("swap a_to_b && exact out", async () => {
    const currIndex = arrayTickIndexToTickIndex({ arrayIndex: -1, offsetIndex: 22 }, tickSpacing);
    const aToB = true;
    const whirlpool = await setupSwapTest({
      ctx,
      client,
      tickSpacing,
      initSqrtPrice: PriceMath.tickIndexToSqrtPriceX64(currIndex),
      initArrayStartTicks: [-5632, 0, 5632],
      fundedPositions: [
        buildPosition(
          // a
          { arrayIndex: -1, offsetIndex: 10 },
          { arrayIndex: 1, offsetIndex: 23 },
          tickSpacing,
          new anchor.BN(250_000_000)
        ),
      ],
    });

    // Setup whirlpool discount info
    const discountTokenMint = await createMint(provider);

    await createAndMintToAssociatedTokenAccount(
      ctx.provider,
      discountTokenMint,
      new anchor.BN(10000000)
    );

    const whirlpoolData = await whirlpool.refreshData();

    const whirlpoolDiscountInfoPubkey = await initializePoolDiscountInfo(
      ctx,
      whirlpool,
      discountTokenMint,
      TOKEN_CONVERSION_FEE_RATE,
      DISCOUNT_FEE_RATE,
      new anchor.BN(2)
    );

    // compute swap ix
    const outputTokenAmount = new u64(1195000);
    const swapToken = aToB ? whirlpoolData.tokenMintB : whirlpoolData.tokenMintA;

    const beforeVaultAmounts = await getVaultAmounts(ctx, whirlpoolData);

    const beforeUserTokenAAmount = await getTokenBalance(
      provider,
      await deriveATA(provider.wallet.publicKey, whirlpoolData.tokenMintA)
    );
    const beforeUserTokenBAmount = await getTokenBalance(
      provider,
      await deriveATA(provider.wallet.publicKey, whirlpoolData.tokenMintB)
    );

    const whirlpooDiscountInfoData = await ctx.fetcher.getPoolDiscountInfo(
      whirlpoolDiscountInfoPubkey
    );

    assert.ok(whirlpooDiscountInfoData != null);

    const quoteWithDiscount = await swapWithFeeDiscountQuoteByOutputToken(
      whirlpool,
      whirlpooDiscountInfoData,
      swapToken,
      outputTokenAmount,
      slippageTolerance,
      ctx.program.programId,
      ctx.fetcher,
      true
    );

    const normalQuote = await swapQuoteByOutputToken(
      whirlpool,
      swapToken,
      outputTokenAmount,
      slippageTolerance,
      ctx.program.programId,
      ctx.fetcher,
      true
    );

    // swap with fee discount
    await (
      await whirlpool.swapWithFeeDiscount(quoteWithDiscount, discountTokenMint)
    ).buildAndExecute();
    const afterVaultAmounts = await getVaultAmounts(ctx, whirlpoolData);
    const newData = await whirlpool.refreshData();

    // Assert sdk simulate function run correctly
    assertQuoteAndResults(aToB, quoteWithDiscount, newData, beforeVaultAmounts, afterVaultAmounts);

    // Assert user token balance | exact out - aToB == false
    const afterUserTokenAAmount = await getTokenBalance(
      provider,
      await deriveATA(provider.wallet.publicKey, whirlpoolData.tokenMintA)
    );
    const afterUserTokenBAmount = await getTokenBalance(
      provider,
      await deriveATA(provider.wallet.publicKey, whirlpoolData.tokenMintB)
    );

    assert.equal(
      new BN(afterUserTokenBAmount).sub(new BN(beforeUserTokenBAmount)).toNumber(),
      quoteWithDiscount.estimatedAmountOut.toNumber()
    );

    assert.equal(
      new BN(beforeUserTokenAAmount).sub(new BN(afterUserTokenAAmount)).toNumber(),
      quoteWithDiscount.estimatedAmountIn.toNumber()
    );

    // Amount take in is lesser than normal quote
    assert.ok(
      isApproxEqual(
        normalQuote.estimatedAmountIn,
        quoteWithDiscount.estimatedAmountIn,
        quoteWithDiscount.estimatedAmountIn
          .mul(DEFAULT_FEE_RATE)
          .div(DENOMINATOR)
          .mul(new BN(whirlpooDiscountInfoData.tokenConversionFeeRate))
          .div(new BN(DISCOUNT_FEE_RATE_MUL_VALUE))
      )
    );
  });
});

const isApproxEqual = (a: anchor.BN, b: anchor.BN, diff: anchor.BN): boolean => {
  // Get 2% of diff
  const twoPercentOfDiff = diff.mul(new BN(2)).div(new BN(100));

  // Get the upper bound of b + c
  const upperBound = b.add(diff).add(twoPercentOfDiff);

  // Get the lower bound of b - c
  const lowerBound = b.add(diff).sub(twoPercentOfDiff);

  // if a between lower and upper, return true
  if (a.gte(lowerBound) && a.lte(upperBound)) {
    return true;
  }
  return false;
};
