import { MathUtil, Percentage, deriveATA } from "@orca-so/common-sdk";
import * as anchor from "@project-serum/anchor";
import { web3 } from "@project-serum/anchor";
import { u64 } from "@solana/spl-token";
import * as assert from "assert";
import { BN } from "bn.js";
import Decimal from "decimal.js";
import {
  buildWhirlpoolClient,
  MAX_SQRT_PRICE,
  MIN_SQRT_PRICE,
  PDAUtil,
  PriceMath,
  SwapParams,
  swapQuoteByInputToken,
  TickArrayData,
  TickUtil,
  TICK_ARRAY_SIZE,
  toTx,
  WhirlpoolContext,
  WhirlpoolIx,
  swapWithFeeDiscountQuoteByInputToken,
  Whirlpool,
  swapQuoteByInputTokenWithDevFees,
} from "../../../../src";
import {
  assertDevFeeQuotes,
  assertDevTokenAmount,
  assertQuoteAndResults,
  getTokenBalance,
  MAX_U64,
  TickSpacing,
  ZERO_BN,
} from "../../../utils";
import {
  FundedPositionParams,
  fundPositions,
  initTestPool,
  initTestPoolWithLiquidity,
  initTestPoolWithTokens,
  initTickArrayRange,
  withdrawPositions,
} from "../../../utils/init-utils";
import { getVaultAmounts } from "../../../utils/whirlpools-test-utils";
import {
  arrayTickIndexToTickIndex,
  buildPosition,
  setupSwapTest,
} from "../../../utils/swap-test-utils";

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

  it("swap with token A as input - exact in", async () => {
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

    const inputTokenAmount = new u64(1195000);

    const whirlpoolData = await whirlpool.refreshData();
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

    const quoteWithDiscount = await swapWithFeeDiscountQuoteByInputToken(
      whirlpool,
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
    await (await whirlpool.swapWithFeeDiscount(quoteWithDiscount)).buildAndExecute();
    const afterVaultAmounts = await getVaultAmounts(ctx, whirlpoolData);
    const newData = await whirlpool.refreshData();

    assertQuoteAndResults(aToB, quoteWithDiscount, newData, beforeVaultAmounts, afterVaultAmounts);

    const afterUserTokenAAmount = await getTokenBalance(
      provider,
      await deriveATA(provider.wallet.publicKey, whirlpoolData.tokenMintA)
    );
    const afterUserTokenBAmount = await getTokenBalance(
      provider,
      await deriveATA(provider.wallet.publicKey, whirlpoolData.tokenMintB)
    );

    // Assert user token balance
    assert.equal(
      new BN(beforeUserTokenAAmount).sub(new BN(afterUserTokenAAmount)).toNumber(),
      quoteWithDiscount.estimatedAmountIn
    );

    assert.equal(
      new BN(afterUserTokenBAmount).sub(new BN(beforeUserTokenBAmount)).toNumber(),
      quoteWithDiscount.estimatedAmountOut
    );

    // Assert that user get a discount
    assert.ok(
      isRoundupEqual(
        quoteWithDiscount.estimatedAmountOut,
        normalQuote.estimatedAmountOut,
        quoteWithDiscount.estimatedAmountOut.mul(DEFAULT_FEE_RATE).div(DENOMINATOR)
      )
    );
  });

  it("swap with token B as input - exact in", async () => {
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

    const inputTokenAmount = new u64(1195000);

    const whirlpoolData = await whirlpool.refreshData();
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

    const quoteWithDiscount = await swapWithFeeDiscountQuoteByInputToken(
      whirlpool,
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
    await (await whirlpool.swapWithFeeDiscount(quoteWithDiscount)).buildAndExecute();
    const afterVaultAmounts = await getVaultAmounts(ctx, whirlpoolData);
    const newData = await whirlpool.refreshData();

    assertQuoteAndResults(aToB, quoteWithDiscount, newData, beforeVaultAmounts, afterVaultAmounts);

    const afterUserTokenAAmount = await getTokenBalance(
      provider,
      await deriveATA(provider.wallet.publicKey, whirlpoolData.tokenMintA)
    );
    const afterUserTokenBAmount = await getTokenBalance(
      provider,
      await deriveATA(provider.wallet.publicKey, whirlpoolData.tokenMintB)
    );

    // Assert user token balance
    assert.equal(
      new BN(afterUserTokenAAmount).sub(new BN(beforeUserTokenAAmount)).toNumber(),
      quoteWithDiscount.estimatedAmountOut
    );

    assert.equal(
      new BN(beforeUserTokenBAmount).sub(new BN(afterUserTokenBAmount)).toNumber(),
      quoteWithDiscount.estimatedAmountIn
    );

    // Assert that user get a discount
    assert.ok(
      isRoundupEqual(
        quoteWithDiscount.estimatedAmountOut,
        normalQuote.estimatedAmountOut,
        quoteWithDiscount.estimatedAmountOut.mul(DEFAULT_FEE_RATE).div(DENOMINATOR)
      )
    );
  });
});

const isRoundupEqual = (a: anchor.BN, b: anchor.BN, diff: anchor.BN): boolean => {
  // Get 2% of C
  const twoPercentOfC = diff.mul(new BN(2)).div(new BN(100));

  // Get the upper bound of b + c
  const upperBound = b.add(diff);

  // Get the lower bound of b - c
  const lowerBound = b.sub(diff);

  // if a between lower and upper, return true
  if (a.gte(lowerBound) && a.lte(upperBound)) {
    return true;
  }
  return false;
};
