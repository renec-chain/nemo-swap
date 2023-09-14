import { MathUtil, Percentage } from "@orca-so/common-sdk";
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
import { Keypair } from "@solana/web3.js";

describe("swap_with_fee_discount", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.Whirlpool;
  const ctx = WhirlpoolContext.fromWorkspace(provider, program);
  const fetcher = ctx.fetcher;
  const client = buildWhirlpoolClient(ctx);
  const slippageTolerance = Percentage.fromFraction(0, 100);
  const tickSpacing = TickSpacing.SixtyFour;

  it("swap with token A as inptu", async () => {
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

    console.log("normal quote estimatedAmountIn", normalQuote.estimatedAmountIn.toString());
    console.log("normal quote estimatedAmountOut", normalQuote.estimatedAmountOut.toString());
    console.log("quote with fee discount In", quoteWithDiscount.estimatedAmountIn.toString());
    console.log("quote with fee discount Out", quoteWithDiscount.estimatedAmountOut.toString());
  });

  // it("swaps with token mint B as input", async () => {
  //   const { poolInitInfo, whirlpoolPda, tokenAccountA, tokenAccountB } =
  //     await initTestPoolWithTokens(ctx, TickSpacing.Standard);
  //   const aToB = false;
  //   await initTickArrayRange(
  //     ctx,
  //     whirlpoolPda.publicKey,
  //     22528, // to 33792
  //     3,
  //     TickSpacing.Standard,
  //     aToB
  //   );

  //   const fundParams: FundedPositionParams[] = [
  //     {
  //       liquidityAmount: new anchor.BN(10_000_000),
  //       tickLowerIndex: 29440,
  //       tickUpperIndex: 33536,
  //     },
  //   ];

  //   await fundPositions(ctx, poolInitInfo, tokenAccountA, tokenAccountB, fundParams);

  //   const tokenVaultABefore = new anchor.BN(
  //     await getTokenBalance(provider, poolInitInfo.tokenVaultAKeypair.publicKey)
  //   );
  //   const tokenVaultBBefore = new anchor.BN(
  //     await getTokenBalance(provider, poolInitInfo.tokenVaultBKeypair.publicKey)
  //   );

  //   const oraclePda = PDAUtil.getOracle(ctx.program.programId, whirlpoolPda.publicKey);

  //   const whirlpoolKey = poolInitInfo.whirlpoolPda.publicKey;
  //   const whirlpool = await client.getPool(whirlpoolKey, true);
  //   const whirlpoolData = whirlpool.getData();
  //   const quote = await swapWithFeeDiscountQuoteByInputToken(
  //     whirlpool,
  //     whirlpoolData.tokenMintB,
  //     new u64(100000),
  //     Percentage.fromFraction(1, 100),
  //     ctx.program.programId,
  //     fetcher,
  //     true
  //   );

  //   await toTx(
  //     ctx,
  //     WhirlpoolIx.swapWithFeeDiscountIx(ctx.program, {
  //       ...quote,
  //       whirlpool: whirlpoolPda.publicKey,
  //       tokenAuthority: ctx.wallet.publicKey,
  //       tokenOwnerAccountA: tokenAccountA,
  //       tokenVaultA: poolInitInfo.tokenVaultAKeypair.publicKey,
  //       tokenOwnerAccountB: tokenAccountB,
  //       tokenVaultB: poolInitInfo.tokenVaultBKeypair.publicKey,
  //       oracle: oraclePda.publicKey,
  //     })
  //   ).buildAndExecute();

  //   assert.equal(
  //     await getTokenBalance(provider, poolInitInfo.tokenVaultAKeypair.publicKey),
  //     tokenVaultABefore.sub(quote.estimatedAmountOut).toString()
  //   );
  //   assert.equal(
  //     await getTokenBalance(provider, poolInitInfo.tokenVaultBKeypair.publicKey),
  //     tokenVaultBBefore.add(quote.estimatedAmountIn).toString()
  //   );
  // });
});

async function getQuotes(
  ctx: WhirlpoolContext,
  whirlpool: Whirlpool,
  swapToken: anchor.Address,
  inputTokenAmount: u64,
  postFeeTokenAmount: u64,
  slippageTolerance: Percentage,
  devFeePercentage: Percentage
) {
  const inputTokenQuote = await swapQuoteByInputToken(
    whirlpool,
    swapToken,
    inputTokenAmount,
    slippageTolerance,
    ctx.program.programId,
    ctx.fetcher,
    true
  );
  const postFeeInputTokenQuote = await swapQuoteByInputToken(
    whirlpool,
    swapToken,
    postFeeTokenAmount,
    slippageTolerance,
    ctx.program.programId,
    ctx.fetcher,
    true
  );
  const inputTokenQuoteWithDevFees = await swapQuoteByInputTokenWithDevFees(
    whirlpool,
    swapToken,
    inputTokenAmount,
    slippageTolerance,
    ctx.program.programId,
    ctx.fetcher,
    devFeePercentage,
    true
  );

  return { inputTokenQuote, postFeeInputTokenQuote, inputTokenQuoteWithDevFees };
}
