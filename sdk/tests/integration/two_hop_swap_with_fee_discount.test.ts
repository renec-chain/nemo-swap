import { deriveATA, Percentage } from "@orca-so/common-sdk";
import * as anchor from "@project-serum/anchor";
import { u64 } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import * as assert from "assert";
import {
  buildWhirlpoolClient,
  InitPoolParams,
  PDAUtil,
  swapQuoteByInputToken,
  swapQuoteByOutputToken,
  swapWithFeeDiscountQuoteByInputToken,
  toTx,
  twoHopSwapQuoteFromSwapQuotes,
  WhirlpoolContext,
  WhirlpoolIx,
} from "../../src";
import { TwoHopSwapParams } from "../../src/instructions";
import {
  createAndMintToAssociatedTokenAccount,
  createMint,
  getTokenBalance,
  initializePoolDiscountInfo,
  isApproxEqual,
  TickSpacing,
} from "../utils";
import {
  buildTestAquariums,
  FundedPositionParams,
  getDefaultAquarium,
  getTokenAccsForPools,
  InitAquariumParams,
} from "../utils/init-utils";
import Decimal from "decimal.js";
import { getRateOverToken } from "../../src/impl/util";

const TOKEN_CONVERSION_FEE_RATE = 4000; // 40%
const DISCOUNT_FEE_RATE = 5000; // 50% of token conversion rate
const DISCOUNT_FEE_RATE_MUL_VALUE = 10000;
const RAW_TOKEN_A_RATE = 2;
const EXPO = 6;

describe("two-hop swap with fee discounts", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.Whirlpool;
  const ctx = WhirlpoolContext.fromWorkspace(provider, program);
  const fetcher = ctx.fetcher;
  const client = buildWhirlpoolClient(ctx);

  let aqConfig: InitAquariumParams;
  beforeEach(async () => {
    aqConfig = getDefaultAquarium();
    // Add a third token and account and a second pool
    aqConfig.initMintParams.push({});
    aqConfig.initTokenAccParams.push({ mintIndex: 2 });
    aqConfig.initPoolParams.push({ mintIndices: [1, 2], tickSpacing: TickSpacing.Standard });

    // Add tick arrays and positions
    const aToB = false;
    aqConfig.initTickArrayRangeParams.push({
      poolIndex: 0,
      startTickIndex: 22528,
      arrayCount: 3,
      aToB,
    });
    //
    aqConfig.initTickArrayRangeParams.push({
      poolIndex: 1,
      startTickIndex: 22528,
      arrayCount: 3,
      aToB,
    });
    const fundParams: FundedPositionParams[] = [
      {
        liquidityAmount: new anchor.BN(10_000_0000),
        tickLowerIndex: 29440,
        tickUpperIndex: 33536,
      },
    ];
    aqConfig.initPositionParams.push({ poolIndex: 0, fundParams });
    aqConfig.initPositionParams.push({ poolIndex: 1, fundParams });
  });

  it("succeed: two hop swap with fee discount", async () => {
    const aquarium = (await buildTestAquariums(ctx, [aqConfig]))[0];
    const { tokenAccounts, mintKeys, pools } = aquarium;

    let tokenBalances = await getTokenBalances(tokenAccounts.map((acc) => acc.account));

    const tokenVaultBalances = await getTokenBalancesForVaults(pools);

    const whirlpoolOneKey = pools[0].whirlpoolPda.publicKey;
    const whirlpoolTwoKey = pools[1].whirlpoolPda.publicKey;
    let whirlpoolOne = await client.getPool(whirlpoolOneKey, true);
    let whirlpoolTwo = await client.getPool(whirlpoolTwoKey, true);

    const [inputToken, intermediaryToken, _outputToken] = mintKeys;

    // Setup whirlpool discount info
    const discountTokenMint = await createMint(provider);

    let discountTokenOwnerAccount = await createAndMintToAssociatedTokenAccount(
      ctx.provider,
      discountTokenMint,
      new anchor.BN(10000000)
    );

    // Get whirlool discount info
    const whirlpoolOneDiscountInfoPubkey = await initializePoolDiscountInfo(
      ctx,
      whirlpoolOne,
      discountTokenMint,
      TOKEN_CONVERSION_FEE_RATE,
      DISCOUNT_FEE_RATE,
      getRateOverToken(whirlpoolOne.getTokenAInfo(), 6, new Decimal(RAW_TOKEN_A_RATE)),
      EXPO
    );

    const whirlpoolTwoDiscountInfoPubkey = await initializePoolDiscountInfo(
      ctx,
      whirlpoolTwo,
      discountTokenMint,
      TOKEN_CONVERSION_FEE_RATE,
      DISCOUNT_FEE_RATE,
      getRateOverToken(whirlpoolTwo.getTokenAInfo(), 6, new Decimal(RAW_TOKEN_A_RATE)),
      EXPO
    );

    const whirlpoolOneDiscountInfoData = await ctx.fetcher.getPoolDiscountInfo(
      whirlpoolOneDiscountInfoPubkey
    );

    const whirlpoolTwoDiscountInfoData = await ctx.fetcher.getPoolDiscountInfo(
      whirlpoolTwoDiscountInfoPubkey
    );

    assert.ok(whirlpoolOneDiscountInfoData);
    assert.ok(whirlpoolTwoDiscountInfoData);

    // Get swap quotes
    const inputAmount = new u64(100000);
    const quote = await swapWithFeeDiscountQuoteByInputToken(
      whirlpoolOne,
      discountTokenMint,
      inputToken,
      inputAmount,
      Percentage.fromFraction(1, 100),
      ctx.program.programId,
      fetcher,
      true
    );

    const quote2 = await swapWithFeeDiscountQuoteByInputToken(
      whirlpoolTwo,
      discountTokenMint,
      intermediaryToken,
      quote.estimatedAmountOut,
      Percentage.fromFraction(1, 100),
      ctx.program.programId,
      fetcher,
      true
    );

    let preUserTokenBalances = await getUserTokenBalancesByTokenMints(ctx.wallet.publicKey, [
      inputToken,
      intermediaryToken,
      _outputToken,
      discountTokenMint,
    ]);

    // Do swap
    const twoHopQuote = twoHopSwapQuoteFromSwapQuotes(quote, quote2);
    await toTx(
      ctx,
      WhirlpoolIx.twoHopSwapWithFeeDiscountIx(ctx.program, {
        ...twoHopQuote,
        ...getParamsFromPools([pools[0], pools[1]], tokenAccounts),
        tokenAuthority: ctx.wallet.publicKey,
        discountToken: discountTokenMint,
        whirlpoolDiscountInfoOne: whirlpoolOneDiscountInfoPubkey,
        whirlpoolDiscountInfoTwo: whirlpoolTwoDiscountInfoPubkey,
        discountTokenOwnerAccount: discountTokenOwnerAccount,
      })
    ).buildAndExecute();

    let postUserTokenBalance = await getUserTokenBalancesByTokenMints(ctx.wallet.publicKey, [
      inputToken,
      intermediaryToken,
      _outputToken,
      discountTokenMint,
    ]);

    assert.deepEqual(await getTokenBalancesForVaults(pools), [
      tokenVaultBalances[0].add(quote.estimatedAmountIn),
      tokenVaultBalances[1].sub(quote.estimatedAmountOut),
      tokenVaultBalances[2].add(quote2.estimatedAmountIn),
      tokenVaultBalances[3].sub(quote2.estimatedAmountOut),
    ]);

    const prevTbs = [...tokenBalances];
    tokenBalances = await getTokenBalances(tokenAccounts.map((acc) => acc.account));

    assert.deepEqual(tokenBalances, [
      prevTbs[0].sub(quote.estimatedAmountIn),
      prevTbs[1],
      prevTbs[2].add(quote2.estimatedAmountOut),
    ]);

    // assert burn amount
    assert.ok(
      isApproxEqual(
        preUserTokenBalances[3],
        postUserTokenBalance[3],
        quote.estimatedBurnAmount.add(quote2.estimatedBurnAmount)
      )
    );
  });

  it("succeed-sdk: two hop swap with fee discount", async () => {
    const aquarium = (await buildTestAquariums(ctx, [aqConfig]))[0];
    const { tokenAccounts, mintKeys, pools } = aquarium;

    let tokenBalances = await getTokenBalances(tokenAccounts.map((acc) => acc.account));

    const tokenVaultBalances = await getTokenBalancesForVaults(pools);

    const whirlpoolOneKey = pools[0].whirlpoolPda.publicKey;
    const whirlpoolTwoKey = pools[1].whirlpoolPda.publicKey;
    let whirlpoolOne = await client.getPool(whirlpoolOneKey, true);
    let whirlpoolTwo = await client.getPool(whirlpoolTwoKey, true);

    const [inputToken, intermediaryToken, _outputToken] = mintKeys;

    // Setup whirlpool discount info
    const discountTokenMint = await createMint(provider);

    let discountTokenOwnerAccount = await createAndMintToAssociatedTokenAccount(
      ctx.provider,
      discountTokenMint,
      new anchor.BN(10000000)
    );

    // Get whirlool discount info
    const whirlpoolOneDiscountInfoPubkey = await initializePoolDiscountInfo(
      ctx,
      whirlpoolOne,
      discountTokenMint,
      TOKEN_CONVERSION_FEE_RATE,
      DISCOUNT_FEE_RATE,
      getRateOverToken(whirlpoolOne.getTokenAInfo(), 6, new Decimal(RAW_TOKEN_A_RATE)),
      EXPO
    );

    const whirlpoolTwoDiscountInfoPubkey = await initializePoolDiscountInfo(
      ctx,
      whirlpoolTwo,
      discountTokenMint,
      TOKEN_CONVERSION_FEE_RATE,
      DISCOUNT_FEE_RATE,
      getRateOverToken(whirlpoolTwo.getTokenAInfo(), 6, new Decimal(RAW_TOKEN_A_RATE)),
      EXPO
    );

    const whirlpoolOneDiscountInfoData = await ctx.fetcher.getPoolDiscountInfo(
      whirlpoolOneDiscountInfoPubkey
    );

    const whirlpoolTwoDiscountInfoData = await ctx.fetcher.getPoolDiscountInfo(
      whirlpoolTwoDiscountInfoPubkey
    );

    assert.ok(whirlpoolOneDiscountInfoData);
    assert.ok(whirlpoolTwoDiscountInfoData);

    // Get swap quotes
    const inputAmount = new u64(100000);
    const quote = await swapWithFeeDiscountQuoteByInputToken(
      whirlpoolOne,
      discountTokenMint,
      inputToken,
      inputAmount,
      Percentage.fromFraction(1, 100),
      ctx.program.programId,
      fetcher,
      true
    );

    const quote2 = await swapWithFeeDiscountQuoteByInputToken(
      whirlpoolTwo,
      discountTokenMint,
      intermediaryToken,
      quote.estimatedAmountOut,
      Percentage.fromFraction(1, 100),
      ctx.program.programId,
      fetcher,
      true
    );

    let preUserTokenBalances = await getUserTokenBalancesByTokenMints(ctx.wallet.publicKey, [
      inputToken,
      intermediaryToken,
      _outputToken,
      discountTokenMint,
    ]);

    // Do swap
    const tx = await client.twoHopSwapWithFeeDiscount(
      quote,
      whirlpoolOne,
      quote2,
      whirlpoolTwo,
      discountTokenMint
    );

    await tx.tx.buildAndExecute();

    let postUserTokenBalance = await getUserTokenBalancesByTokenMints(ctx.wallet.publicKey, [
      inputToken,
      intermediaryToken,
      _outputToken,
      discountTokenMint,
    ]);

    assert.deepEqual(await getTokenBalancesForVaults(pools), [
      tokenVaultBalances[0].add(quote.estimatedAmountIn),
      tokenVaultBalances[1].sub(quote.estimatedAmountOut),
      tokenVaultBalances[2].add(quote2.estimatedAmountIn),
      tokenVaultBalances[3].sub(quote2.estimatedAmountOut),
    ]);

    const prevTbs = [...tokenBalances];
    tokenBalances = await getTokenBalances(tokenAccounts.map((acc) => acc.account));

    assert.deepEqual(tokenBalances, [
      prevTbs[0].sub(quote.estimatedAmountIn),
      prevTbs[1],
      prevTbs[2].add(quote2.estimatedAmountOut),
    ]);

    // assert burn amount
    assert.ok(
      isApproxEqual(
        preUserTokenBalances[3],
        postUserTokenBalance[3],
        quote.estimatedBurnAmount.add(quote2.estimatedBurnAmount)
      )
    );
  });

  function getParamsFromPools(
    pools: [InitPoolParams, InitPoolParams],
    tokenAccounts: { mint: PublicKey; account: PublicKey }[]
  ) {
    const tokenAccKeys = getTokenAccsForPools(pools, tokenAccounts);

    const whirlpoolOne = pools[0].whirlpoolPda.publicKey;
    const whirlpoolTwo = pools[1].whirlpoolPda.publicKey;
    const oracleOne = PDAUtil.getOracle(ctx.program.programId, whirlpoolOne).publicKey;
    const oracleTwo = PDAUtil.getOracle(ctx.program.programId, whirlpoolTwo).publicKey;
    return {
      whirlpoolOne: pools[0].whirlpoolPda.publicKey,
      whirlpoolTwo: pools[1].whirlpoolPda.publicKey,
      tokenOwnerAccountOneA: tokenAccKeys[0],
      tokenVaultOneA: pools[0].tokenVaultAKeypair.publicKey,
      tokenOwnerAccountOneB: tokenAccKeys[1],
      tokenVaultOneB: pools[0].tokenVaultBKeypair.publicKey,
      tokenOwnerAccountTwoA: tokenAccKeys[2],
      tokenVaultTwoA: pools[1].tokenVaultAKeypair.publicKey,
      tokenOwnerAccountTwoB: tokenAccKeys[3],
      tokenVaultTwoB: pools[1].tokenVaultBKeypair.publicKey,
      oracleOne,
      oracleTwo,
    };
  }

  async function getTokenBalancesForVaults(pools: InitPoolParams[]) {
    const accs = [];
    for (const pool of pools) {
      accs.push(pool.tokenVaultAKeypair.publicKey);
      accs.push(pool.tokenVaultBKeypair.publicKey);
    }
    return getTokenBalances(accs);
  }

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
