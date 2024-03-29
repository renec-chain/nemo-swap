import {
  AddressUtil,
  TransactionBuilder,
  TokenUtil,
  resolveOrCreateATAs,
  ZERO,
  resolveOrCreateATA,
} from "@orca-so/common-sdk";
import { Address, BN, Wallet } from "@project-serum/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import invariant from "tiny-invariant";
import { WhirlpoolContext } from "../context";
import { initTickArrayIx } from "../instructions";
import {
  collectAllForPositionAddressesTxns,
  collectProtocolFees,
} from "../instructions/composites";
import { WhirlpoolIx } from "../ix";
import { AccountFetcher } from "../network/public";
import { SwapInput, WhirlpoolData } from "../types/public";
import { getTickArrayDataForPosition } from "../utils/builder/position-builder-util";
import { PDAUtil, PoolUtil, PriceMath, TickUtil, toTx } from "../utils/public";
import { Position, Whirlpool, WhirlpoolClient } from "../whirlpool-client";
import { PositionImpl } from "./position-impl";
import { getRewardInfos, getTokenMintInfos, getTokenVaultAccountInfos } from "./util";
import { WhirlpoolImpl } from "./whirlpool-impl";
import { SwapQuote, twoHopSwapQuoteFromSwapQuotes } from "../quotes/public";

export class WhirlpoolClientImpl implements WhirlpoolClient {
  constructor(readonly ctx: WhirlpoolContext) {}

  public getContext(): WhirlpoolContext {
    return this.ctx;
  }

  public getFetcher(): AccountFetcher {
    return this.ctx.fetcher;
  }

  public async getPool(poolAddress: Address, refresh = false): Promise<Whirlpool> {
    const account = await this.ctx.fetcher.getPool(poolAddress, refresh);
    if (!account) {
      throw new Error(`Unable to fetch Whirlpool at address at ${poolAddress}`);
    }
    const tokenInfos = await getTokenMintInfos(this.ctx.fetcher, account, refresh);
    const vaultInfos = await getTokenVaultAccountInfos(this.ctx.fetcher, account, refresh);
    const rewardInfos = await getRewardInfos(this.ctx.fetcher, account, refresh);
    return new WhirlpoolImpl(
      this.ctx,
      AddressUtil.toPubKey(poolAddress),
      tokenInfos[0],
      tokenInfos[1],
      vaultInfos[0],
      vaultInfos[1],
      rewardInfos,
      account
    );
  }

  public async getPools(poolAddresses: Address[], refresh = false): Promise<Whirlpool[]> {
    const accounts = (await this.ctx.fetcher.listPools(poolAddresses, refresh)).filter(
      (account): account is WhirlpoolData => !!account
    );
    if (accounts.length !== poolAddresses.length) {
      throw new Error(`Unable to fetch all Whirlpools at addresses ${poolAddresses}`);
    }
    const tokenMints = new Set<string>();
    const tokenAccounts = new Set<string>();
    accounts.forEach((account) => {
      tokenMints.add(account.tokenMintA.toBase58());
      tokenMints.add(account.tokenMintB.toBase58());
      tokenAccounts.add(account.tokenVaultA.toBase58());
      tokenAccounts.add(account.tokenVaultB.toBase58());
      account.rewardInfos.forEach((rewardInfo) => {
        if (PoolUtil.isRewardInitialized(rewardInfo)) {
          tokenAccounts.add(rewardInfo.vault.toBase58());
        }
      });
    });
    await this.ctx.fetcher.listMintInfos(Array.from(tokenMints), refresh);
    await this.ctx.fetcher.listTokenInfos(Array.from(tokenAccounts), refresh);

    const whirlpools: Whirlpool[] = [];
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      const poolAddress = poolAddresses[i];
      const tokenInfos = await getTokenMintInfos(this.ctx.fetcher, account, false);
      const vaultInfos = await getTokenVaultAccountInfos(this.ctx.fetcher, account, false);
      const rewardInfos = await getRewardInfos(this.ctx.fetcher, account, false);
      whirlpools.push(
        new WhirlpoolImpl(
          this.ctx,
          AddressUtil.toPubKey(poolAddress),
          tokenInfos[0],
          tokenInfos[1],
          vaultInfos[0],
          vaultInfos[1],
          rewardInfos,
          account
        )
      );
    }
    return whirlpools;
  }

  public async getAllPositionsOf(owner: PublicKey, refresh = false): Promise<Position[]> {
    const { ctx } = this;
    // Get all token accounts
    const tokenAccounts = (
      await ctx.connection.getTokenAccountsByOwner(owner, {
        programId: TOKEN_PROGRAM_ID,
      })
    ).value;

    // Get candidate addresses for the position
    let positionCandidatePubkeys = [] as Address[];
    tokenAccounts.forEach((ta) => {
      const parsed = TokenUtil.deserializeTokenAccount(ta.account.data);
      if (parsed) {
        const pda = PDAUtil.getPosition(ctx.program.programId, parsed.mint);
        // Returns the address of the Whirlpool position only if the number of tokens is 1 (ignores empty token accounts and non-NFTs)
        if (new BN(parsed.amount.toString()).eq(new BN(1))) {
          positionCandidatePubkeys.push(pda.publicKey);
        }
      }
    });
    const positions = [] as Position[];

    Object.values(await this.getPositions(positionCandidatePubkeys, refresh)).forEach((p) => {
      if (p) {
        positions.push(p);
      }
    });
    return positions;
  }

  public async getPosition(positionAddress: Address, refresh = false): Promise<Position> {
    const account = await this.ctx.fetcher.getPosition(positionAddress, refresh);
    if (!account) {
      throw new Error(`Unable to fetch Position at address at ${positionAddress}`);
    }
    const whirlAccount = await this.ctx.fetcher.getPool(account.whirlpool, refresh);
    if (!whirlAccount) {
      throw new Error(`Unable to fetch Whirlpool for Position at address at ${positionAddress}`);
    }

    const [lowerTickArray, upperTickArray] = await getTickArrayDataForPosition(
      this.ctx,
      account,
      whirlAccount,
      refresh
    );
    if (!lowerTickArray || !upperTickArray) {
      throw new Error(`Unable to fetch TickArrays for Position at address at ${positionAddress}`);
    }
    return new PositionImpl(
      this.ctx,
      AddressUtil.toPubKey(positionAddress),
      account,
      whirlAccount,
      lowerTickArray,
      upperTickArray
    );
  }

  public async getPositions(
    positionAddresses: Address[],
    refresh = false
  ): Promise<Record<string, Position | null>> {
    // TODO: Prefetch and use fetcher as a cache - Think of a cleaner way to prefetch
    const positions = await this.ctx.fetcher.listPositions(positionAddresses, refresh);
    const whirlpoolAddrs = positions
      .map((position) => position?.whirlpool.toBase58())
      .flatMap((x) => (!!x ? x : []));
    await this.ctx.fetcher.listPools(whirlpoolAddrs, refresh);
    const tickArrayAddresses: Set<string> = new Set();
    await Promise.all(
      positions.map(async (pos) => {
        if (pos) {
          const pool = await this.ctx.fetcher.getPool(pos.whirlpool, false);
          if (pool) {
            const lowerTickArrayPda = PDAUtil.getTickArrayFromTickIndex(
              pos.tickLowerIndex,
              pool.tickSpacing,
              pos.whirlpool,
              this.ctx.program.programId
            ).publicKey;
            const upperTickArrayPda = PDAUtil.getTickArrayFromTickIndex(
              pos.tickUpperIndex,
              pool.tickSpacing,
              pos.whirlpool,
              this.ctx.program.programId
            ).publicKey;
            tickArrayAddresses.add(lowerTickArrayPda.toBase58());
            tickArrayAddresses.add(upperTickArrayPda.toBase58());
          }
        }
      })
    );
    await this.ctx.fetcher.listTickArrays(Array.from(tickArrayAddresses), true);

    // Use getPosition and the prefetched values to generate the Positions
    const results = await Promise.all(
      positionAddresses.map(async (pos) => {
        try {
          const position = await this.getPosition(pos, false);
          return [pos, position];
        } catch {
          return [pos, null];
        }
      })
    );
    return Object.fromEntries(results);
  }

  public async createPool(
    whirlpoolsConfig: Address,
    tokenMintA: Address,
    tokenMintB: Address,
    tickSpacing: number,
    initialTick: number,
    funder: Address,
    refresh = false
  ): Promise<{ poolKey: PublicKey; tx: TransactionBuilder }> {
    invariant(TickUtil.checkTickInBounds(initialTick), "initialTick is out of bounds.");
    invariant(
      TickUtil.isTickInitializable(initialTick, tickSpacing),
      `initial tick ${initialTick} is not an initializable tick for tick-spacing ${tickSpacing}`
    );

    const correctTokenOrder = PoolUtil.orderMints(tokenMintA, tokenMintB).map((addr) =>
      addr.toString()
    );

    invariant(
      correctTokenOrder[0] === tokenMintA.toString(),
      "Token order needs to be flipped to match the canonical ordering (i.e. sorted on the byte repr. of the mint pubkeys)"
    );

    whirlpoolsConfig = AddressUtil.toPubKey(whirlpoolsConfig);

    const feeTierKey = PDAUtil.getFeeTier(
      this.ctx.program.programId,
      whirlpoolsConfig,
      tickSpacing
    ).publicKey;

    const initSqrtPrice = PriceMath.tickIndexToSqrtPriceX64(initialTick);
    const tokenVaultAKeypair = Keypair.generate();
    const tokenVaultBKeypair = Keypair.generate();

    const whirlpoolPda = PDAUtil.getWhirlpool(
      this.ctx.program.programId,
      whirlpoolsConfig,
      new PublicKey(tokenMintA),
      new PublicKey(tokenMintB),
      tickSpacing
    );

    const feeTier = await this.ctx.fetcher.getFeeTier(feeTierKey, refresh);
    invariant(!!feeTier, `Fee tier for ${tickSpacing} doesn't exist`);

    const txBuilder = new TransactionBuilder(
      this.ctx.provider.connection,
      this.ctx.provider.wallet
    );

    const initPoolIx = WhirlpoolIx.initializePoolIx(this.ctx.program, {
      initSqrtPrice,
      whirlpoolsConfig,
      whirlpoolPda,
      tokenMintA: new PublicKey(tokenMintA),
      tokenMintB: new PublicKey(tokenMintB),
      tokenVaultAKeypair,
      tokenVaultBKeypair,
      feeTierKey,
      tickSpacing,
      funder: new PublicKey(funder),
    });

    const initialTickArrayStartTick = TickUtil.getStartTickIndex(initialTick, tickSpacing);
    const initialTickArrayPda = PDAUtil.getTickArray(
      this.ctx.program.programId,
      whirlpoolPda.publicKey,
      initialTickArrayStartTick
    );

    txBuilder.addInstruction(initPoolIx);
    txBuilder.addInstruction(
      initTickArrayIx(this.ctx.program, {
        startTick: initialTickArrayStartTick,
        tickArrayPda: initialTickArrayPda,
        whirlpool: whirlpoolPda.publicKey,
        funder: AddressUtil.toPubKey(funder),
      })
    );

    return {
      poolKey: whirlpoolPda.publicKey,
      tx: txBuilder,
    };
  }

  public async collectFeesAndRewardsForPositions(
    positionAddresses: Address[],
    refresh?: boolean | undefined
  ): Promise<TransactionBuilder[]> {
    const walletKey = this.ctx.wallet.publicKey;
    return collectAllForPositionAddressesTxns(
      this.ctx,
      {
        positions: positionAddresses,
        receiver: walletKey,
        positionAuthority: walletKey,
        positionOwner: walletKey,
        payer: walletKey,
      },
      refresh
    );
  }

  public async collectProtocolFeesForPools(poolAddresses: Address[]): Promise<TransactionBuilder> {
    return collectProtocolFees(this.ctx, poolAddresses);
  }

  public async twoHopSwap(
    swapQuote1: SwapQuote,
    whirlpool1: Whirlpool,
    swapQuote2: SwapQuote,
    whirlpool2: Whirlpool,
    wallet?: Wallet | undefined
  ): Promise<TransactionBuilder> {
    const twoHopSwapQuote = twoHopSwapQuoteFromSwapQuotes(swapQuote1, swapQuote2);

    const sourceWallet = wallet ?? this.ctx.provider.wallet;

    const oracleOne = PDAUtil.getOracle(
      this.ctx.program.programId,
      whirlpool1.getAddress()
    ).publicKey;

    const oracleTwo = PDAUtil.getOracle(
      this.ctx.program.programId,
      whirlpool2.getAddress()
    ).publicKey;

    const whirlpoolData1 = whirlpool1.getData();
    const whirlpoolData2 = whirlpool2.getData();

    const quote1NativeTokenAmount = swapQuote1.amountSpecifiedIsInput ? swapQuote1.amount : swapQuote1.otherAmountThreshold
    const quote2NativeTokenAmount = swapQuote2.amountSpecifiedIsInput ? swapQuote2.amount : swapQuote2.otherAmountThreshold

    const requests = [
      {
        tokenMint: whirlpoolData1.tokenMintA,
        wrappedSolAmountIn: swapQuote1.aToB ? quote1NativeTokenAmount : ZERO,
      },
      {
        tokenMint: whirlpoolData1.tokenMintB,
        wrappedSolAmountIn: !swapQuote1.aToB ? quote1NativeTokenAmount : ZERO,
      },
      {
        tokenMint: whirlpoolData2.tokenMintA,
        wrappedSolAmountIn: swapQuote2.aToB ? quote2NativeTokenAmount : ZERO,
      },
      {
        tokenMint: whirlpoolData2.tokenMintB,
        wrappedSolAmountIn: !swapQuote2.aToB ? quote2NativeTokenAmount : ZERO,
      },
    ];

    
    const resolveAllAtasPromise = []
    for (const req of requests) {
      const instruction = resolveOrCreateATA(
        this.ctx.connection,
        sourceWallet.publicKey,
        req.tokenMint,
        () => this.ctx.fetcher.getAccountRentExempt(),
        req.wrappedSolAmountIn
      );
      resolveAllAtasPromise.push(instruction);
    }

    const resolveAllAtas = await Promise.all(resolveAllAtasPromise);

    const createATAInstructions = [];
    // make a set of unique address
    const uniqueAddresses = new Set<string>();
    for (const resolveAta of resolveAllAtas) {
      const { address: ataAddress, ...instructions } = resolveAta;

      if (!uniqueAddresses.has(ataAddress.toBase58())) {
        createATAInstructions.push(instructions);
        uniqueAddresses.add(ataAddress.toBase58());
      }
    }

    const poolParams = {
      whirlpoolOne: whirlpool1.getAddress(),
      whirlpoolTwo: whirlpool2.getAddress(),
      tokenOwnerAccountOneA: resolveAllAtas[0].address,
      tokenVaultOneA: whirlpoolData1.tokenVaultA,
      tokenOwnerAccountOneB: resolveAllAtas[1].address,
      tokenVaultOneB: whirlpoolData1.tokenVaultB,
      tokenOwnerAccountTwoA: resolveAllAtas[2].address,
      tokenVaultTwoA: whirlpoolData2.tokenVaultA,
      tokenOwnerAccountTwoB: resolveAllAtas[3].address,
      tokenVaultTwoB: whirlpoolData2.tokenVaultB,
      oracleOne,
      oracleTwo,
    };

    const ix = WhirlpoolIx.twoHopSwapIx(this.ctx.program, {
      ...twoHopSwapQuote,
      ...poolParams,
      tokenAuthority: sourceWallet.publicKey,
    });

    return toTx(this.ctx, ix).prependInstructions(createATAInstructions);
  }
}
