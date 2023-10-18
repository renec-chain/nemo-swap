import { MathUtil, Percentage, deriveATA } from "@orca-so/common-sdk";
import * as anchor from "@project-serum/anchor";
import { web3 } from "@project-serum/anchor";
import { u64 } from "@solana/spl-token";
import * as assert from "assert";
import { BN } from "bn.js";
import {
  buildWhirlpoolClient,
  PriceMath,
  swapQuoteByInputToken,
  WhirlpoolContext,
  swapWithFeeDiscountQuoteByInputToken,
  swapWithFeeDiscountQuoteByOutputToken,
  swapQuoteByOutputToken,
} from "../../../../src";
import {
  assertQuoteAndResults,
  createAndMintToAssociatedTokenAccount,
  createMint,
  getTokenBalance,
  initializePoolDiscountInfo,
  isApproxEqual,
  TickSpacing,
} from "../../../utils";

import { getVaultAmounts } from "../../../utils/whirlpools-test-utils";
import {
  arrayTickIndexToTickIndex,
  buildPosition,
  setupSwapTest,
} from "../../../utils/swap-test-utils";
import { PublicKey, Signer } from "@solana/web3.js";
import { getRateOverToken } from "../../../../src/impl/util";
import Decimal from "decimal.js";

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
  const RAW_TOKEN_A_RATE = 2;
  const EXPO = 6;

  // Note: tokens created from setupSwapTest have decimals = 0
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
      getRateOverToken(whirlpool.getTokenAInfo(), 6, new Decimal(RAW_TOKEN_A_RATE)),
      EXPO
    );

    // compute swap ix
    const inputTokenAmount = new u64(1195000);
    const swapToken = aToB ? whirlpoolData.tokenMintA : whirlpoolData.tokenMintB;

    const beforeVaultAmounts = await getVaultAmounts(ctx, whirlpoolData);

    const beforeUserTokenAmounts = await getUserTokenBalancesByTokenMints(
      provider.wallet.publicKey,
      [whirlpoolData.tokenMintA, whirlpoolData.tokenMintB, discountTokenMint]
    );

    const whirlpooDiscountInfoData = await ctx.fetcher.getPoolDiscountInfo(
      whirlpoolDiscountInfoPubkey
    );

    assert.ok(whirlpooDiscountInfoData != null);

    const quoteWithDiscount = await swapWithFeeDiscountQuoteByInputToken(
      whirlpool,
      discountTokenMint,
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
    const afterUserTokenAmounts = await getUserTokenBalancesByTokenMints(
      provider.wallet.publicKey,
      [whirlpoolData.tokenMintA, whirlpoolData.tokenMintB, discountTokenMint]
    );

    assert.deepEqual(beforeUserTokenAmounts, [
      afterUserTokenAmounts[0].add(new BN(quoteWithDiscount.estimatedAmountIn)),
      afterUserTokenAmounts[1].sub(new BN(quoteWithDiscount.estimatedAmountOut)),
      afterUserTokenAmounts[2].add(quoteWithDiscount.estimatedBurnAmount),
    ]);

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

    // a_to_b && exact in -> fee in token A
    const burnAmountInTokenA = normalQuote.estimatedFeeAmount
      .mul(new BN(TOKEN_CONVERSION_FEE_RATE))
      .mul(new BN(DISCOUNT_FEE_RATE))
      .div(new BN(DISCOUNT_FEE_RATE_MUL_VALUE))
      .div(new BN(DISCOUNT_FEE_RATE_MUL_VALUE));

    // 1 x 10^(decimal_d) * vD = RAW_TOKEN_A_RATE * vA and qD2 * vD = qA2 * vA  -> qD2 = qA2 / RAW_TOKEN_A_RATE * 10^(decimal_d)
    const expectedBurnAmount = burnAmountInTokenA.div(new BN(RAW_TOKEN_A_RATE)); // 1 discount Token = RAW_TOKEN_A_RATE * token A

    assert.ok(isApproxEqual(quoteWithDiscount.estimatedBurnAmount, new BN(0), expectedBurnAmount));
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
      getRateOverToken(whirlpool.getTokenAInfo(), 6, new Decimal(RAW_TOKEN_A_RATE)),
      EXPO
    );

    // Compute swap ix
    const inputTokenAmount = new u64(1195000);
    const swapToken = aToB ? whirlpoolData.tokenMintA : whirlpoolData.tokenMintB;
    const beforeVaultAmounts = await getVaultAmounts(ctx, whirlpoolData);

    const beforeUserTokenAmounts = await getUserTokenBalancesByTokenMints(
      provider.wallet.publicKey,
      [whirlpoolData.tokenMintA, whirlpoolData.tokenMintB, discountTokenMint]
    );

    const whirlpooDiscountInfoData = await ctx.fetcher.getPoolDiscountInfo(
      whirlpoolDiscountInfoPubkey
    );

    assert.ok(whirlpooDiscountInfoData != null);

    const quoteWithDiscount = await swapWithFeeDiscountQuoteByInputToken(
      whirlpool,
      discountTokenMint,
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
    const afterUserTokenAmounts = await getUserTokenBalancesByTokenMints(
      provider.wallet.publicKey,
      [whirlpoolData.tokenMintA, whirlpoolData.tokenMintB, discountTokenMint]
    );

    // b_to_a && exact in
    assert.deepEqual(beforeUserTokenAmounts, [
      afterUserTokenAmounts[0].sub(new BN(quoteWithDiscount.estimatedAmountOut)),
      afterUserTokenAmounts[1].add(new BN(quoteWithDiscount.estimatedAmountIn)),
      afterUserTokenAmounts[2].add(quoteWithDiscount.estimatedBurnAmount),
    ]);

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

    //  b_to_a && exact in -> fee in token B
    const burnAmountInTokenB = normalQuote.estimatedFeeAmount
      .mul(new BN(TOKEN_CONVERSION_FEE_RATE))
      .mul(new BN(DISCOUNT_FEE_RATE))
      .div(new BN(DISCOUNT_FEE_RATE_MUL_VALUE))
      .div(new BN(DISCOUNT_FEE_RATE_MUL_VALUE));

    // convert A to B.
    // out = qA, in = qB
    // qA * vA = qB * vB and q2A * vA = q2B * vB -> q2A = q2B / qB * qA
    const burnAmountInTokenA = burnAmountInTokenB
      .mul(new BN(quoteWithDiscount.estimatedAmountOut))
      .div(new BN(quoteWithDiscount.estimatedAmountIn));

    const expectedBurnAmount = burnAmountInTokenA.div(new BN(RAW_TOKEN_A_RATE));
    assert.ok(isApproxEqual(quoteWithDiscount.estimatedBurnAmount, new BN(0), expectedBurnAmount));
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
      getRateOverToken(whirlpool.getTokenAInfo(), 6, new Decimal(RAW_TOKEN_A_RATE)),
      EXPO
    );

    // compute swap ix
    const outputTokenAmount = new u64(1195000);
    const swapToken = aToB ? whirlpoolData.tokenMintB : whirlpoolData.tokenMintA;

    const beforeVaultAmounts = await getVaultAmounts(ctx, whirlpoolData);

    const beforeUserTokenAmounts = await getUserTokenBalancesByTokenMints(
      provider.wallet.publicKey,
      [whirlpoolData.tokenMintA, whirlpoolData.tokenMintB, discountTokenMint]
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
    const afterUserTokenAmounts = await getUserTokenBalancesByTokenMints(
      provider.wallet.publicKey,
      [whirlpoolData.tokenMintA, whirlpoolData.tokenMintB, discountTokenMint]
    );

    // b_to_a && exact out
    assert.deepEqual(beforeUserTokenAmounts, [
      afterUserTokenAmounts[0].sub(new BN(quoteWithDiscount.estimatedAmountOut)),
      afterUserTokenAmounts[1].add(new BN(quoteWithDiscount.estimatedAmountIn)),
      afterUserTokenAmounts[2].add(quoteWithDiscount.estimatedBurnAmount),
    ]);

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

    // b_to_a && exact out -> fee in token A
    const burnAmountInTokenA = normalQuote.estimatedFeeAmount
      .mul(new BN(TOKEN_CONVERSION_FEE_RATE))
      .mul(new BN(DISCOUNT_FEE_RATE))
      .div(new BN(DISCOUNT_FEE_RATE_MUL_VALUE))
      .div(new BN(DISCOUNT_FEE_RATE_MUL_VALUE));

    // 1 x 10^(decimal_d) * vD = RAW_TOKEN_A_RATE * vA and qD2 * vD = qA2 * vA  -> qD2 = qA2 / RAW_TOKEN_A_RATE * 10^(decimal_d)
    const expectedBurnAmount = burnAmountInTokenA.div(new BN(RAW_TOKEN_A_RATE)); // 1 discount Token = RAW_TOKEN_A_RATE * token A

    assert.ok(isApproxEqual(quoteWithDiscount.estimatedBurnAmount, new BN(0), expectedBurnAmount));
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
      getRateOverToken(whirlpool.getTokenAInfo(), 6, new Decimal(RAW_TOKEN_A_RATE)),
      EXPO
    );

    // compute swap ix
    const outputTokenAmount = new u64(1195000);
    const swapToken = aToB ? whirlpoolData.tokenMintB : whirlpoolData.tokenMintA;

    const beforeVaultAmounts = await getVaultAmounts(ctx, whirlpoolData);

    const beforeUserTokenAccounts = await getUserTokenBalancesByTokenMints(
      provider.wallet.publicKey,
      [whirlpoolData.tokenMintA, whirlpoolData.tokenMintB, discountTokenMint]
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
    const afterUserTokenAccounts = await getUserTokenBalancesByTokenMints(
      provider.wallet.publicKey,
      [whirlpoolData.tokenMintA, whirlpoolData.tokenMintB, discountTokenMint]
    );

    // b_to_a && exact out
    assert.deepEqual(beforeUserTokenAccounts.slice(0, 2), [
      afterUserTokenAccounts[0].add(new BN(quoteWithDiscount.estimatedAmountIn)),
      afterUserTokenAccounts[1].sub(new BN(quoteWithDiscount.estimatedAmountOut)),
    ]);

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

    assert.ok(
      isApproxEqual(
        beforeUserTokenAccounts[2],
        afterUserTokenAccounts[2],
        quoteWithDiscount.estimatedBurnAmount
      )
    );

    //  a_to_b && exact out -> fee in token B
    const burnAmountInTokenB = normalQuote.estimatedFeeAmount
      .mul(new BN(TOKEN_CONVERSION_FEE_RATE))
      .mul(new BN(DISCOUNT_FEE_RATE))
      .div(new BN(DISCOUNT_FEE_RATE_MUL_VALUE))
      .div(new BN(DISCOUNT_FEE_RATE_MUL_VALUE));

    // convert A to B.
    // out = qB, in = qA
    // qA * vA = qB * vB and q2A * vA = q2B * vB -> q2A = q2B / qB * qA
    const burnAmountInTokenA = burnAmountInTokenB
      .mul(new BN(quoteWithDiscount.estimatedAmountIn))
      .div(new BN(quoteWithDiscount.estimatedAmountOut));

    const expectedBurnAmount = burnAmountInTokenA.div(new BN(RAW_TOKEN_A_RATE));
    assert.ok(isApproxEqual(quoteWithDiscount.estimatedBurnAmount, new BN(0), expectedBurnAmount));
  });

  it("fail: use not whitelist pool discount info", async () => {
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
    const discountTokenMintA = await createMint(provider);
    const discountTokenMintB = await createMint(provider);

    await createAndMintToAssociatedTokenAccount(
      ctx.provider,
      discountTokenMintB,
      new anchor.BN(10000000)
    );

    const whirlpoolDiscountInfoPubkey = await initializePoolDiscountInfo(
      ctx,
      whirlpool,
      discountTokenMintB,
      TOKEN_CONVERSION_FEE_RATE,
      DISCOUNT_FEE_RATE,
      getRateOverToken(whirlpool.getTokenAInfo(), 6, new Decimal(RAW_TOKEN_A_RATE)),
      EXPO
    );

    // compute swap ix
    const whirlpoolData = await whirlpool.refreshData();
    const inputTokenAmount = new u64(1195000);
    const swapToken = aToB ? whirlpoolData.tokenMintA : whirlpoolData.tokenMintB;

    const whirlpooDiscountInfoData = await ctx.fetcher.getPoolDiscountInfo(
      whirlpoolDiscountInfoPubkey
    );

    assert.ok(whirlpooDiscountInfoData != null);

    const quoteWithDiscount = await swapWithFeeDiscountQuoteByInputToken(
      whirlpool,
      discountTokenMintB,
      swapToken,
      inputTokenAmount,
      slippageTolerance,
      ctx.program.programId,
      ctx.fetcher,
      true
    );

    // swap with fee discount, but discount token mint A not created
    await assert.rejects(
      (await whirlpool.swapWithFeeDiscount(quoteWithDiscount, discountTokenMintA)).buildAndExecute()
    );
  });

  it("fail:  use not invalid pool discount info", async () => {
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

    const whirlpool2 = await setupSwapTest({
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
    const discountTokenMint1 = await createMint(provider);
    const discountTokenMint2 = await createMint(provider);

    await createAndMintToAssociatedTokenAccount(
      ctx.provider,
      discountTokenMint1,
      new anchor.BN(10000000)
    );

    await createAndMintToAssociatedTokenAccount(
      ctx.provider,
      discountTokenMint2,
      new anchor.BN(10000000)
    );

    const whirlpoolDiscountInfoPubkey1 = await initializePoolDiscountInfo(
      ctx,
      whirlpool,
      discountTokenMint1,
      TOKEN_CONVERSION_FEE_RATE,
      DISCOUNT_FEE_RATE,
      getRateOverToken(whirlpool.getTokenAInfo(), 6, new Decimal(RAW_TOKEN_A_RATE)),
      EXPO
    );

    // discount token mint 2 is initialized
    await initializePoolDiscountInfo(
      ctx,
      whirlpool2,
      discountTokenMint2,
      TOKEN_CONVERSION_FEE_RATE,
      DISCOUNT_FEE_RATE,
      getRateOverToken(whirlpool.getTokenAInfo(), 6, new Decimal(RAW_TOKEN_A_RATE)),
      EXPO
    );

    // compute swap ix
    const whirlpoolData = await whirlpool.refreshData();
    const inputTokenAmount = new u64(1195000);
    const swapToken = aToB ? whirlpoolData.tokenMintA : whirlpoolData.tokenMintB;

    const whirlpooDiscountInfo1Data = await ctx.fetcher.getPoolDiscountInfo(
      whirlpoolDiscountInfoPubkey1
    );

    assert.ok(whirlpooDiscountInfo1Data != null);

    const quoteWithDiscount = await swapWithFeeDiscountQuoteByInputToken(
      whirlpool,
      discountTokenMint1,
      swapToken,
      inputTokenAmount,
      slippageTolerance,
      ctx.program.programId,
      ctx.fetcher,
      true
    );

    // swap pool 1, but using discount info of pool 2
    await assert.rejects(
      (await whirlpool.swapWithFeeDiscount(quoteWithDiscount, discountTokenMint2)).buildAndExecute()
    );
  });

  // utils function
  async function getUserTokenBalancesByTokenMints(user: PublicKey, tokenMint: PublicKey[]) {
    const accs = [];
    for (const mint of tokenMint) {
      accs.push(await deriveATA(user, mint));
    }

    return getTokenBalances(accs);
  }

  async function getTokenBalances(keys: PublicKey[]) {
    return Promise.all(
      keys.map(async (key) => new anchor.BN(await getTokenBalance(provider, key)))
    );
  }
});
