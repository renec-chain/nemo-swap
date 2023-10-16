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
  CustomWallet,
  genNewWallet,
  getWhirlPool,
  mintToByAuthority,
} from "./utils";
import { getPoolInfo } from "../create_pool/utils/pool";
import {
  TwoHopTokens,
  executeGaslessTx,
  getTwoHopSwapTokens,
} from "./utils/swap";
import { u64 } from "@solana/spl-token";
import {
  GaslessDapp,
  GaslessTransaction,
  Wallet,
  sendToGasless,
} from "@renec-foundation/gasless-sdk";
import { Address } from "@project-serum/anchor";

const SLIPPAGE = Percentage.fromFraction(1, 100);

async function main() {
  const config = getConfig();

  const wallets = loadWallets([ROLES.USER]);
  const userAuth = wallets[ROLES.USER];

  // Generate new wallets for testing
  const { ctx } = loadProvider(userAuth);
  const client = buildWhirlpoolClient(ctx);
  const newWallet = await genNewWallet(ctx.connection);
  console.log("new wallet:", newWallet.publicKey.toString());

  const poolInfo0 = getPoolInfo(0);
  const poolInfo1 = getPoolInfo(1);

  const pool0 = await getWhirlPool(client, poolInfo0);
  const pool1 = await getWhirlPool(client, poolInfo1);

  // GEt swap tokens
  const twoHopTokens = getTwoHopSwapTokens(pool0, pool1);

  // await mintToByAuthority(
  //   ctx.provider,
  //   new PublicKey(twoHopTokens.pool2OtherToken),
  //   newWallet.publicKey,
  //   0
  // );
  // Get swap quote
  const amount = new u64(10);
  const quote1 = await swapWithFeeDiscountQuoteByInputToken(
    pool0,
    new PublicKey(config.DISCOUNT_TOKEN),
    twoHopTokens.pool1OtherToken,
    amount,
    SLIPPAGE,
    ctx.program.programId,
    ctx.fetcher,
    true
  );

  const quote2 = await swapQuoteByInputToken(
    pool1,
    twoHopTokens.intermidaryToken,
    quote1.estimatedAmountOut,
    SLIPPAGE,
    ctx.program.programId,
    ctx.fetcher,
    true
  );

  // swap two hops
  await swapTwoHops(
    "two hops - 0 ",
    client,
    pool0,
    pool1,
    [0, 1, 2],
    newWallet
  );
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});

const swapTwoHops = async (
  testCase: string,
  client: WhirlpoolClient,
  pool0: Whirlpool,
  pool1: Whirlpool,
  preCreateTokenAccountTwoHops: number[],
  walletKeypair: Keypair,
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
    preCreateTokenAccountTwoHops,
    wallet.publicKey
  );

  // Swap three hops
  const tx = await getTwoHopSwapIx(client, pool0, pool1, wallet);

  try {
    console.log("tx size: ", await tx.txnSize());
  } catch (e) {
    console.log("tx failed: ", e);
  }

  // Construct gasless txn
  const dappUtil = await GaslessDapp.new(client.getContext().connection);
  const gaslessTxn = GaslessTransaction.fromTransactionBuilder(
    client.getContext().connection,
    wallet as CustomWallet,
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
  wallet: Wallet
): Promise<TransactionBuilder> => {
  const twoHopTokens = getTwoHopSwapTokens(pool0, pool1);

  const amount = new u64(10);
  const quote1 = await swapQuoteByInputToken(
    pool0,
    twoHopTokens.pool1OtherToken,
    amount,
    SLIPPAGE,
    client.getContext().program.programId,
    client.getContext().fetcher,
    true
  );
  console.log("quote1: ", quote1.estimatedAmountOut.toString());

  const quote2 = await swapQuoteByInputToken(
    pool1,
    twoHopTokens.intermidaryToken,
    quote1.estimatedAmountOut,
    SLIPPAGE,
    client.getContext().program.programId,
    client.getContext().fetcher,
    true
  );
  console.log("quote2: ", quote2.estimatedAmountOut.toString());

  // two hop swap
  let twoHopTx = await client.twoHopSwap(quote1, pool0, quote2, pool1, wallet);

  return twoHopTx;
};

const createTokenAccounts = async (
  client: WhirlpoolClient,
  tokens: Address[],
  mintAts: number[],
  des: PublicKey
) => {
  for (let i = 0; i < mintAts.length; i++) {
    await mintToByAuthority(
      client.getContext().provider,
      new PublicKey(tokens[mintAts[i]]),
      des,
      10
    );
  }
};
