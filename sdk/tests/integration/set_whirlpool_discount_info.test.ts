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
} from "../../src";
import {
  assertQuoteAndResults,
  createAndMintToAssociatedTokenAccount,
  createMint,
  getTokenBalance,
  initializePoolDiscountInfo,
  isApproxEqual,
  setPoolDiscountInfo,
  TickSpacing,
} from "../utils";

import { arrayTickIndexToTickIndex, buildPosition, setupSwapTest } from "../utils/swap-test-utils";
import { getRateOverToken } from "../../src";
import Decimal from "decimal.js";

describe("set_fee_discount_info", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.Whirlpool;
  const ctx = WhirlpoolContext.fromWorkspace(provider, program);
  const fetcher = ctx.fetcher;
  const client = buildWhirlpoolClient(ctx);
  const tickSpacing = TickSpacing.SixtyFour;

  const TOKEN_CONVERSION_FEE_RATE = 4000; // 40%
  const DISCOUNT_FEE_RATE = 5000; // 50% of token conversion rate
  const DISCOUNT_FEE_RATE_MUL_VALUE = 10000;
  const RAW_TOKEN_A_RATE = 2;
  const EXPO = 6;

  // Note: tokens created from setupSwapTest have decimals = 0
  it("test success: set whirlpool discount info", async () => {
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

    const whirlpoolDiscountInfoPubkey = await initializePoolDiscountInfo(
      ctx,
      whirlpool,
      discountTokenMint,
      TOKEN_CONVERSION_FEE_RATE,
      DISCOUNT_FEE_RATE,
      getRateOverToken(whirlpool.getTokenAInfo(), EXPO, new Decimal(RAW_TOKEN_A_RATE)),
      EXPO
    );

    let whirlpoolDiscountInfo = await fetcher.getPoolDiscountInfo(
      whirlpoolDiscountInfoPubkey,
      true
    );
    assert.ok(whirlpoolDiscountInfo?.discountTokenRateOverTokenA.eq(new anchor.BN(2000000)));

    // Can change rate over token A
    await setPoolDiscountInfo(
      ctx,
      whirlpool,
      discountTokenMint,
      TOKEN_CONVERSION_FEE_RATE,
      DISCOUNT_FEE_RATE,
      getRateOverToken(whirlpool.getTokenAInfo(), 3, new Decimal(3)),
      3
    );

    whirlpoolDiscountInfo = await fetcher.getPoolDiscountInfo(whirlpoolDiscountInfoPubkey, true);
    assert.ok(whirlpoolDiscountInfo?.discountTokenRateOverTokenA.eq(new anchor.BN(3000)));

    // Can change TOKEN_CONVERSION_FEE_RATE
    await setPoolDiscountInfo(
      ctx,
      whirlpool,
      discountTokenMint,
      100,
      DISCOUNT_FEE_RATE,
      getRateOverToken(whirlpool.getTokenAInfo(), EXPO, new Decimal(RAW_TOKEN_A_RATE)),
      EXPO
    );

    whirlpoolDiscountInfo = await fetcher.getPoolDiscountInfo(whirlpoolDiscountInfoPubkey, true);
    assert.ok(whirlpoolDiscountInfo?.tokenConversionFeeRate == 100);

    // Can change discout fee rate
    await setPoolDiscountInfo(
      ctx,
      whirlpool,
      discountTokenMint,
      TOKEN_CONVERSION_FEE_RATE,
      500,
      getRateOverToken(whirlpool.getTokenAInfo(), EXPO, new Decimal(RAW_TOKEN_A_RATE)),
      EXPO
    );

    whirlpoolDiscountInfo = await fetcher.getPoolDiscountInfo(whirlpoolDiscountInfoPubkey, true);
    assert.ok(whirlpoolDiscountInfo?.discountFeeRate == 500);
  });
});
