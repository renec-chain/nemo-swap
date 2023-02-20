import * as anchor from "@project-serum/anchor";
import * as assert from "assert";
import { toTx, WhirlpoolContext, WhirlpoolData, WhirlpoolIx, 
  PriceMath, PDAUtil, swapQuoteByInputToken, buildWhirlpoolClient } from "../../src";
import { TickSpacing, ZERO_BN } from "../utils";
import { initTestPool, openPosition, 
  fundPositions, initTestPoolWithTokens, initTickArrayRange, FundedPositionParams } from "../utils/init-utils";
import { WhirlpoolTestFixture } from "../utils/fixture";
import { PoolUtil, toTokenAmount } from "../../src/utils/public/pool-utils";
import { MathUtil, Percentage } from "@orca-so/common-sdk";
import Decimal from "decimal.js";
import { decreaseLiquidityQuoteByLiquidityWithParams } from "../../src/quotes/public/decrease-liquidity-quote";
import { u64 } from "@solana/spl-token";

describe("set_enable_flag", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.Whirlpool;
  const ctx = WhirlpoolContext.fromWorkspace(provider, program);
  const fetcher = ctx.fetcher;
  const client = buildWhirlpoolClient(ctx);
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  it("successfully set_enable_flag", async () => {
    const { poolInitInfo, configInitInfo } = await initTestPool(
      ctx,
      TickSpacing.Standard
    );
    const whirlpoolKey = poolInitInfo.whirlpoolPda.publicKey;
    const whirlpoolsConfigKey = configInitInfo.whirlpoolsConfigKeypair.publicKey;
    const poolCreatorAuthority = configInitInfo.poolCreatorAuthority;
    const defaultEnabledFlag = true;
    const isEnabled = false;

    let whirlpool = (await fetcher.getPool(whirlpoolKey, true)) as WhirlpoolData;
    assert.equal(whirlpool.isEnabled, defaultEnabledFlag);

    await program.rpc.setEnableFlag(isEnabled, {
      accounts: {
        whirlpoolsConfig: whirlpoolsConfigKey,
        whirlpool: whirlpoolKey,
        poolCreatorAuthority,
      }
    });

    whirlpool = (await fetcher.getPool(poolInitInfo.whirlpoolPda.publicKey, true)) as WhirlpoolData;
    assert.equal(whirlpool.isEnabled, isEnabled);
  });

  it("fails if invalid pool_creator_authority provided", async () => {
    const { poolInitInfo, configInitInfo } = await initTestPool(
      ctx,
      TickSpacing.Standard
    );
    const whirlpoolKey = poolInitInfo.whirlpoolPda.publicKey;
    const whirlpoolsConfigKey = configInitInfo.whirlpoolsConfigKeypair.publicKey;
    const otherAuthorityKeypair = anchor.web3.Keypair.generate();
    const isEnabled = false;

    await assert.rejects(
      program.rpc.setEnableFlag(isEnabled, {
        accounts: {
          whirlpoolsConfig: whirlpoolsConfigKey,
          whirlpool: whirlpoolKey,
          poolCreatorAuthority: otherAuthorityKeypair.publicKey,
        },
        signers: [otherAuthorityKeypair],
      }),
      /An address constraint was violated/
    );
  });

  it("fails open_position if pool enable is false", async () => {
    const { poolInitInfo, configInitInfo } = await initTestPool(
      ctx,
      TickSpacing.Standard
    );
    const whirlpoolKey = poolInitInfo.whirlpoolPda.publicKey;
    const whirlpoolsConfigKey = configInitInfo.whirlpoolsConfigKeypair.publicKey;
    const poolCreatorAuthority = configInitInfo.poolCreatorAuthority;
    const isEnabled = false;

    const tickLowerIndex = 0;
    const tickUpperIndex = 128;

    await program.rpc.setEnableFlag(isEnabled, {
      accounts: {
        whirlpoolsConfig: whirlpoolsConfigKey,
        whirlpool: whirlpoolKey,
        poolCreatorAuthority,
      }
    });
    await sleep(1000);

    await assert.rejects(
      openPosition(
        ctx,
        whirlpoolKey,
        tickLowerIndex,
        tickUpperIndex
      ),
      /0x1799/ // Pool was disabled
    );
  });

  it("fails close_position if pool enable is false", async () => {
    const { configInitInfo, poolInitInfo } = await initTestPool(ctx, TickSpacing.Standard);
    const { params } = await openPosition(ctx, poolInitInfo.whirlpoolPda.publicKey, 0, 128);

    const whirlpoolKey = poolInitInfo.whirlpoolPda.publicKey;
    const whirlpoolsConfigKey = configInitInfo.whirlpoolsConfigKeypair.publicKey;
    const poolCreatorAuthority = configInitInfo.poolCreatorAuthority;
    const isEnabled = false;

    await program.rpc.setEnableFlag(isEnabled, {
      accounts: {
        whirlpoolsConfig: whirlpoolsConfigKey,
        whirlpool: whirlpoolKey,
        poolCreatorAuthority,
      }
    });
    await sleep(1000);
    const whirlpool = (await fetcher.getPool(poolInitInfo.whirlpoolPda.publicKey, true)) as WhirlpoolData;
    assert.equal(whirlpool.isEnabled, isEnabled);
    
    const receiverKeypair = anchor.web3.Keypair.generate();

    await assert.rejects(
      toTx(
        ctx,
        WhirlpoolIx.closePositionIx(ctx.program, {
          whirlpool: poolInitInfo.whirlpoolPda.publicKey,
          positionAuthority: provider.wallet.publicKey,
          receiver: receiverKeypair.publicKey,
          position: params.positionPda.publicKey,
          positionMint: params.positionMintAddress,
          positionTokenAccount: params.positionTokenAccount,
        })
      ).buildAndExecute(),
      /0x1799/ // Pool was disabled
    );
  })

  it("fails increase_liquidity if pool enable is false", async () => {
    const currTick = 0;
    const tickLowerIndex = -1280;
    const tickUpperIndex = 1280;
    const fixture = await new WhirlpoolTestFixture(ctx).init({
      tickSpacing: TickSpacing.Standard,
      positions: [{ tickLowerIndex, tickUpperIndex, liquidityAmount: ZERO_BN }],
      initialSqrtPrice: PriceMath.tickIndexToSqrtPriceX64(currTick),
    });
    const { configInitInfo, poolInitInfo, positions, tokenAccountA, tokenAccountB } = fixture.getInfos();
    const { whirlpoolPda } = poolInitInfo;
    const positionInitInfo = positions[0];

    const whirlpoolsConfigKey = configInitInfo.whirlpoolsConfigKeypair.publicKey;
    const poolCreatorAuthority = configInitInfo.poolCreatorAuthority;
    const isEnabled = false;
    await program.rpc.setEnableFlag(isEnabled, {
      accounts: {
        whirlpoolsConfig: whirlpoolsConfigKey,
        whirlpool: whirlpoolPda.publicKey,
        poolCreatorAuthority,
      }
    });
    await sleep(1000);

    const tokenAmount = toTokenAmount(167_000, 167_000);
    const liquidityAmount = PoolUtil.estimateLiquidityFromTokenAmounts(
      currTick,
      tickLowerIndex,
      tickUpperIndex,
      tokenAmount
    );

    await assert.rejects(
      toTx(
        ctx,
        WhirlpoolIx.increaseLiquidityIx(ctx.program, {
          liquidityAmount,
          tokenMaxA: tokenAmount.tokenA,
          tokenMaxB: tokenAmount.tokenB,
          whirlpool: whirlpoolPda.publicKey,
          positionAuthority: provider.wallet.publicKey,
          position: positionInitInfo.publicKey,
          positionTokenAccount: positionInitInfo.tokenAccount,
          tokenOwnerAccountA: tokenAccountA,
          tokenOwnerAccountB: tokenAccountB,
          tokenVaultA: poolInitInfo.tokenVaultAKeypair.publicKey,
          tokenVaultB: poolInitInfo.tokenVaultBKeypair.publicKey,
          tickArrayLower: positionInitInfo.tickArrayLower,
          tickArrayUpper: positionInitInfo.tickArrayUpper,
        })
      ).buildAndExecute(),
      /0x1799/ // Pool was disabled
    );
  })
  
  it("fails decrease_liquidity if pool enable is false", async () => {
    const liquidityAmount = new anchor.BN(1_250_000);
    const tickLower = 7168;
    const tickUpper = 8960;
    const fixture = await new WhirlpoolTestFixture(ctx).init({
      tickSpacing: TickSpacing.Standard,
      initialSqrtPrice: MathUtil.toX64(new Decimal(1.48)),
      positions: [{ tickLowerIndex: tickLower, tickUpperIndex: tickUpper, liquidityAmount }],
    });
    const { configInitInfo, poolInitInfo, tokenAccountA, tokenAccountB, positions } = fixture.getInfos();
    const { whirlpoolPda, tokenVaultAKeypair, tokenVaultBKeypair } = poolInitInfo;
    const poolBefore = (await fetcher.getPool(whirlpoolPda.publicKey, true)) as WhirlpoolData;

    const whirlpoolsConfigKey = configInitInfo.whirlpoolsConfigKeypair.publicKey;
    const poolCreatorAuthority = configInitInfo.poolCreatorAuthority;
    const isEnabled = false;
    await program.rpc.setEnableFlag(isEnabled, {
      accounts: {
        whirlpoolsConfig: whirlpoolsConfigKey,
        whirlpool: whirlpoolPda.publicKey,
        poolCreatorAuthority,
      }
    });
    await sleep(1000);

    const removalQuote = decreaseLiquidityQuoteByLiquidityWithParams({
      liquidity: new anchor.BN(1_000_000),
      sqrtPrice: poolBefore.sqrtPrice,
      slippageTolerance: Percentage.fromFraction(1, 100),
      tickCurrentIndex: poolBefore.tickCurrentIndex,
      tickLowerIndex: tickLower,
      tickUpperIndex: tickUpper,
    });

    await assert.rejects(
      toTx(
        ctx,
        WhirlpoolIx.decreaseLiquidityIx(ctx.program, {
          ...removalQuote,
          whirlpool: whirlpoolPda.publicKey,
          positionAuthority: provider.wallet.publicKey,
          position: positions[0].publicKey,
          positionTokenAccount: positions[0].tokenAccount,
          tokenOwnerAccountA: tokenAccountA,
          tokenOwnerAccountB: tokenAccountB,
          tokenVaultA: tokenVaultAKeypair.publicKey,
          tokenVaultB: tokenVaultBKeypair.publicKey,
          tickArrayLower: positions[0].tickArrayLower,
          tickArrayUpper: positions[0].tickArrayUpper,
        })
      ).buildAndExecute(),
      /0x1799/ // Pool was disabled
    );
  });

  it("fails swap if pool enable is false", async () => {
    const { configInitInfo, poolInitInfo, whirlpoolPda, tokenAccountA, tokenAccountB } = await initTestPoolWithTokens(ctx, TickSpacing.Standard);
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

    const oraclePda = PDAUtil.getOracle(ctx.program.programId, whirlpoolPda.publicKey);

    const whirlpoolKey = poolInitInfo.whirlpoolPda.publicKey;
    const whirlpool = await client.getPool(whirlpoolKey, true);
    const whirlpoolData = whirlpool.getData();

    const whirlpoolsConfigKey = configInitInfo.whirlpoolsConfigKeypair.publicKey;
    const poolCreatorAuthority = configInitInfo.poolCreatorAuthority;
    const isEnabled = false;
    await program.rpc.setEnableFlag(isEnabled, {
      accounts: {
        whirlpoolsConfig: whirlpoolsConfigKey,
        whirlpool: whirlpoolPda.publicKey,
        poolCreatorAuthority,
      }
    });
    await sleep(1000);

    const quote = await swapQuoteByInputToken(
      whirlpool,
      whirlpoolData.tokenMintB,
      new u64(100000),
      Percentage.fromFraction(1, 100),
      ctx.program.programId,
      fetcher,
      true
    );

    await assert.rejects(
      toTx(
        ctx,
        WhirlpoolIx.swapIx(ctx.program, {
          ...quote,
          whirlpool: whirlpoolPda.publicKey,
          tokenAuthority: ctx.wallet.publicKey,
          tokenOwnerAccountA: tokenAccountA,
          tokenVaultA: poolInitInfo.tokenVaultAKeypair.publicKey,
          tokenOwnerAccountB: tokenAccountB,
          tokenVaultB: poolInitInfo.tokenVaultBKeypair.publicKey,
          oracle: oraclePda.publicKey,
        })
      ).buildAndExecute(),
      /0x1799/ // Pool was disabled
    );
  });
});
