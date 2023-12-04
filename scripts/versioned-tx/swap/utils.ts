import { PublicKey, Keypair } from "@solana/web3.js";
import { Percentage, TransactionBuilder } from "@orca-so/common-sdk";
import {
  SwapQuote,
  Whirlpool,
  WhirlpoolClient,
  buildWhirlpoolClient,
  swapQuoteByInputToken,
  swapWithFeeDiscountQuoteByInputToken,
} from "@renec/redex-sdk";
import {
  getConfig,
  loadProvider,
  loadWallets,
  ROLES,
} from "../../create_pool/utils";
import {
  genNewWallet,
  getWhirlPool,
  createTokenAccountAndMintTo,
  executeGaslessTx,
  getTwoHopSwapTokens,
  getLogMemoIx,
} from "../../swap/utils";
import { getPoolInfo } from "../../create_pool/utils/pool";

import { u64 } from "@solana/spl-token";
import {
  GaslessDapp,
  GaslessTransaction,
  Wallet,
} from "@renec-foundation/gasless-sdk";
import { Address, BN } from "@project-serum/anchor";
const SLIPPAGE = Percentage.fromFraction(1, 100);

export const createTokenAccounts = async (
  client: WhirlpoolClient,
  tokens: Address[],
  mintAts: number[],
  mintAmounts: number[],
  des: PublicKey
) => {
  for (let i = 0; i < mintAts.length; i++) {
    await createTokenAccountAndMintTo(
      client.getContext().provider,
      new PublicKey(tokens[mintAts[i]]),
      des,
      mintAmounts[i]
    );
  }
};

export const getTwoHopSwapIx = async (
  client: WhirlpoolClient,
  pool0: Whirlpool,
  pool1: Whirlpool,
  wallet: Wallet,
  swapAmount: BN,
  feeDiscountToken?: PublicKey
): Promise<{
  tx: TransactionBuilder;
  quote2: SwapQuote;
}> => {
  const twoHopTokens = getTwoHopSwapTokens(pool0, pool1);

  if (feeDiscountToken) {
    const quote1 = await swapWithFeeDiscountQuoteByInputToken(
      pool0,
      feeDiscountToken,
      twoHopTokens.pool1OtherToken,
      swapAmount,
      SLIPPAGE,
      client.getContext().program.programId,
      client.getContext().fetcher,
      true
    );

    const quote2 = await swapWithFeeDiscountQuoteByInputToken(
      pool1,
      feeDiscountToken,
      twoHopTokens.intermidaryToken,
      quote1.estimatedAmountOut,
      SLIPPAGE,
      client.getContext().program.programId,
      client.getContext().fetcher,
      true
    );

    // two hop swap
    const twoHopTx = await client.twoHopSwapWithFeeDiscount(
      quote1,
      pool0,
      quote2,
      pool1,
      feeDiscountToken,
      wallet
    );

    console.log(
      "Estimated Burn Amount: ",
      twoHopTx.estimatedBurnAmount.toNumber()
    );

    return { tx: twoHopTx.tx, quote2 };
  } else {
    const quote1 = await swapQuoteByInputToken(
      pool0,
      twoHopTokens.pool1OtherToken,
      swapAmount,
      SLIPPAGE,
      client.getContext().program.programId,
      client.getContext().fetcher,
      true
    );

    const quote2 = await swapQuoteByInputToken(
      pool1,
      twoHopTokens.intermidaryToken,
      quote1.estimatedAmountOut,
      SLIPPAGE,
      client.getContext().program.programId,
      client.getContext().fetcher,
      true
    );

    // two hop swap
    let twoHopTx = await client.twoHopSwap(
      quote1,
      pool0,
      quote2,
      pool1,
      wallet
    );

    return { tx: twoHopTx, quote2 };
  }
};
