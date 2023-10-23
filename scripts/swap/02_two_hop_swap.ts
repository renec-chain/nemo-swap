import {
  PublicKey,
  Keypair,
  TransactionInstruction,
  Connection,
} from "@solana/web3.js";
import {
  Percentage,
  TransactionBuilder,
  TransactionPayload,
} from "@orca-so/common-sdk";
import {
  PDAUtil,
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
} from "../create_pool/utils";
import {
  genNewWallet,
  getWhirlPool,
  createTokenAccountAndMintTo,
  executeGaslessTx,
  getTwoHopSwapTokens,
  getLogMemoIx,
} from "./utils";
import { getPoolInfo } from "../create_pool/utils/pool";

import { u64 } from "@solana/spl-token";
import {
  GaslessDapp,
  GaslessTransaction,
  Wallet,
} from "@renec-foundation/gasless-sdk";
import { Address, BN } from "@project-serum/anchor";

const SLIPPAGE = Percentage.fromFraction(1, 100);

//usage: 02_two_hop_swap <pool-idx-0> <pool-idx-1> <discount-token-mint | null>
async function main() {
  const wallets = loadWallets([ROLES.USER]);
  const userAuth = wallets[ROLES.USER];

  // Generate new wallets for testing
  const { ctx } = loadProvider(userAuth);
  const client = buildWhirlpoolClient(ctx);
  const newWallet = await genNewWallet(ctx.connection);

  console.log("new wallet created:", newWallet.publicKey.toString());

  // Get pool from terminal
  const poolIdx0 = parseInt(process.argv[2]);
  const poolIdx1 = parseInt(process.argv[3]);

  const discountTokenMintStr = process.argv[4];
  const discountTokenMint = discountTokenMintStr
    ? new PublicKey(discountTokenMintStr)
    : null;

  if (isNaN(poolIdx0) || isNaN(poolIdx1)) {
    console.error("Please provide two valid pool indexes.");
    return;
  }

  const pool0 = await getWhirlPool(client, getPoolInfo(poolIdx0));
  const pool1 = await getWhirlPool(client, getPoolInfo(poolIdx1));

  const tx1 = await swapTwoHops(
    "two hops - 0 ",
    client,
    pool0,
    pool1,
    [0, 1, 2],
    [100, 0, 0],
    new BN(100000),
    newWallet,
    null,
    true
  );

  // await swapTwoHopsWithRef(
  //   "two hops - 0 ",
  //   client,
  //   pool0,
  //   pool1,
  //   [0, 2],
  //   newWallet,
  //   "abcdf",
  //   null,
  //   false
  // );
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});

const swapTwoHops = async (
  testCase: string,
  client: WhirlpoolClient,
  pool0: Whirlpool,
  pool1: Whirlpool,
  mintAts: number[],
  mintAmounts: number[],
  swapAmount: BN,
  walletKeypair: Keypair,
  feeDiscountToken?: PublicKey,
  executeGasless = false
) => {
  console.log("\n\n Test case: ", testCase);

  const wallet = new Wallet(walletKeypair);
  // Swap route: reusd -> revnd -> rebtc -> reeth
  const twoHopsSwapToken = getTwoHopSwapTokens(pool0, pool1); // reusd - revnd - rebtc
  console.log(
    `Swap routes: ${twoHopsSwapToken.pool1OtherToken.toString()} -> ${twoHopsSwapToken.intermidaryToken.toString()} -> ${twoHopsSwapToken.pool2OtherToken.toString()}}`
  );
  await createTokenAccounts(
    client,
    [
      twoHopsSwapToken.pool1OtherToken,
      twoHopsSwapToken.intermidaryToken,
      twoHopsSwapToken.pool2OtherToken,
    ],
    mintAts,
    mintAmounts,
    wallet.publicKey
  );

  if (feeDiscountToken) {
    await createTokenAccountAndMintTo(
      client.getContext().provider,
      feeDiscountToken,
      wallet.publicKey,
      10
    );
  }

  // Swap three hops
  const tx = await getTwoHopSwapIx(
    client,
    pool0,
    pool1,
    wallet,
    feeDiscountToken
  );

  return tx;

  try {
    console.log("tx size: ", await tx.txnSize());
  } catch (e) {
    console.log("tx failed: ", e);
  }

  // Construct gasless txn
  const dappUtil = await GaslessDapp.new(client.getContext().connection);
  const gaslessTxn = GaslessTransaction.fromTransactionBuilder(
    client.getContext().connection,
    wallet,
    tx.compressIx(true),
    dappUtil
  );

  await executeGaslessTx(gaslessTxn, executeGasless);
};

const swapTwoHopsWithRef = async (
  testCase: string,
  client: WhirlpoolClient,
  pool0: Whirlpool,
  pool1: Whirlpool,
  mintAts: number[],
  mintAmounts: number[],
  walletKeypair: Keypair,
  refCode: string,
  feeDiscountToken?: PublicKey,
  executeGasless = false
) => {
  console.log("\n\n Test case: ", testCase);

  const wallet = new Wallet(walletKeypair);
  // Swap route: reusd -> revnd -> rebtc -> reeth
  const twoHopsSwapToken = getTwoHopSwapTokens(pool0, pool1); // reusd - revnd - rebtc
  await createTokenAccounts(
    client,
    [
      twoHopsSwapToken.pool1OtherToken,
      twoHopsSwapToken.intermidaryToken,
      twoHopsSwapToken.pool2OtherToken,
    ],
    mintAts,
    mintAmounts,
    wallet.publicKey
  );

  if (feeDiscountToken) {
    await createTokenAccountAndMintTo(
      client.getContext().provider,
      new PublicKey(feeDiscountToken),
      wallet.publicKey,
      mintAmounts[0]
    );
  }

  // Swap three hops
  const tx = await getTwoHopSwapIx(
    client,
    pool0,
    pool1,
    wallet,
    feeDiscountToken
  );

  // construct ref code ix
  const refIx = await getLogMemoIx(wallet.publicKey, refCode);
  tx.addInstruction(refIx);

  try {
    console.log("tx size: ", await tx.txnSize());
  } catch (e) {
    console.log("tx failed: ", e);
  }

  // Construct gasless txn
  const dappUtil = await GaslessDapp.new(client.getContext().connection);
  const gaslessTxn = GaslessTransaction.fromTransactionBuilder(
    client.getContext().connection,
    wallet,
    tx.compressIx(true),
    dappUtil
  );

  await executeGaslessTx(gaslessTxn, executeGasless);
};

// utils function
const getTwoHopSwapIx = async (
  client: WhirlpoolClient,
  pool0: Whirlpool,
  pool1: Whirlpool,
  wallet: Wallet,
  feeDiscountToken?: PublicKey
): Promise<TransactionBuilder> => {
  const twoHopTokens = getTwoHopSwapTokens(pool0, pool1);

  const amount = new u64(10);
  if (feeDiscountToken) {
    console.log("\n----------\nDoing two hops swap with fee discount....");

    const quote1 = await swapWithFeeDiscountQuoteByInputToken(
      pool0,
      feeDiscountToken,
      twoHopTokens.pool1OtherToken,
      amount,
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
    return twoHopTx.tx;
  } else {
    console.log("\n----------\nDoing two hops swap ....");
    const quote1 = await swapQuoteByInputToken(
      pool0,
      twoHopTokens.pool1OtherToken,
      amount,
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

    return twoHopTx.tx;
  }
};

const createTokenAccounts = async (
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
