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
} from "../../src";
import { getTokenBalance, MAX_U64, TickSpacing, ZERO_BN } from "../utils";
import {
  FundedPositionParams,
  fundPositions,
  initTestPool,
  initTestPoolWithLiquidity,
  initTestPoolWithTokens,
  initTickArrayRange,
  withdrawPositions,
} from "../utils/init-utils";

describe("swap", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.Whirlpool;
  const ctx = WhirlpoolContext.fromWorkspace(provider, program);
  const fetcher = ctx.fetcher;
  const client = buildWhirlpoolClient(ctx);

  it("swaps across one tick array", async () => {
    const { poolInitInfo, whirlpoolPda, tokenAccountA, tokenAccountB } =
      await initTestPoolWithTokens(ctx, TickSpacing.Standard);
    const aToB = false;
    await initTickArrayRange(
      ctx,
      whirlpoolPda.publicKey,
      22528, // to 33792
      3,
      TickSpacing.Standard,
      aToB
    );

    const fundParams: FundedPositionParams[] = [
      {
        liquidityAmount: new anchor.BN(10_000_000),
        tickLowerIndex: 29440,
        tickUpperIndex: 33536,
      },
    ];

    await fundPositions(ctx, poolInitInfo, tokenAccountA, tokenAccountB, fundParams);

    const tokenVaultABefore = new anchor.BN(
      await getTokenBalance(provider, poolInitInfo.tokenVaultAKeypair.publicKey)
    );
    const tokenVaultBBefore = new anchor.BN(
      await getTokenBalance(provider, poolInitInfo.tokenVaultBKeypair.publicKey)
    );

    const oraclePda = PDAUtil.getOracle(ctx.program.programId, whirlpoolPda.publicKey);

    const whirlpoolKey = poolInitInfo.whirlpoolPda.publicKey;
    const whirlpool = await client.getPool(whirlpoolKey, true);
    const whirlpoolData = whirlpool.getData();
    const quote = await swapQuoteByInputToken(
      whirlpool,
      whirlpoolData.tokenMintB,
      new u64(100000),
      Percentage.fromFraction(1, 100),
      ctx.program.programId,
      fetcher,
      true
    );

    await toTx(
      ctx,
      WhirlpoolIx.swapWithFeeDiscountIx(ctx.program, {
        ...quote,
        whirlpool: whirlpoolPda.publicKey,
        tokenAuthority: ctx.wallet.publicKey,
        tokenOwnerAccountA: tokenAccountA,
        tokenVaultA: poolInitInfo.tokenVaultAKeypair.publicKey,
        tokenOwnerAccountB: tokenAccountB,
        tokenVaultB: poolInitInfo.tokenVaultBKeypair.publicKey,
        oracle: oraclePda.publicKey,
      })
    ).buildAndExecute();

    console.log("estimatedAmountIn", quote.estimatedAmountIn.toString());
    console.log("estimatedAmountOut", quote.estimatedAmountOut.toString());

    assert.equal(
      await getTokenBalance(provider, poolInitInfo.tokenVaultAKeypair.publicKey),
      tokenVaultABefore.sub(quote.estimatedAmountOut).toString()
    );
    assert.equal(
      await getTokenBalance(provider, poolInitInfo.tokenVaultBKeypair.publicKey),
      tokenVaultBBefore.add(quote.estimatedAmountIn).toString()
    );
  });
});
