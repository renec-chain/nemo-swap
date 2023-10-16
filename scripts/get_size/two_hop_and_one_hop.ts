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
} from "@renec/redex-sdk";
import { loadProvider, loadWallets, ROLES } from "../create_pool/utils";
import {
  CustomWallet,
  genNewWallet,
  getTxSize,
  getWhirlPool,
  mintToByAuthority,
} from "./utils";
import { getPoolInfo } from "../create_pool/utils/pool";
import {
  TwoHopTokens,
  executeGaslessTx,
  getOtherTokenOfPool,
  getTwoHopSwapTokens,
} from "./utils/swap";
import { u64 } from "@solana/spl-token";
import { GaslessDapp, GaslessTransaction } from "@renec-foundation/gasless-sdk";
import { Address, Wallet } from "@project-serum/anchor";

const SLIPPAGE = Percentage.fromFraction(50, 100);

async function main() {
  const wallets = loadWallets([ROLES.USER]);

  const userTokenAuth = wallets[ROLES.USER];
  // Generate new wallets for testing
  const { ctx } = loadProvider(userTokenAuth);
  const client = buildWhirlpoolClient(ctx);

  const newWallet = await genNewWallet(ctx.connection);

  const poolInfo0 = getPoolInfo(0); // renec - reusd
  const poolInfo1 = getPoolInfo(1); // reusd - revnd
  const poolInfo2 = getPoolInfo(2); // rebtc - reeth
  const poolInfo3 = getPoolInfo(3); // revnd - rebtc
  const poolInfo4 = getPoolInfo(4); // revnd - renec

  const pool0 = await getWhirlPool(client, poolInfo0);
  const pool1 = await getWhirlPool(client, poolInfo1);
  const pool2 = await getWhirlPool(client, poolInfo2);
  const pool3 = await getWhirlPool(client, poolInfo3);
  const pool4 = await getWhirlPool(client, poolInfo4);

  // tokens to tokens
  // await swapThreeHops(
  //   "tokens to tokens",
  //   client,
  //   pool0,
  //   pool3,
  //   pool2,
  //   [0, 2],
  //   [],
  //   newWallet
  // );

  await swapThreeHops(
    "renec as intermediary",
    client,
    pool3,
    pool1,
    pool0,
    [0, 1, 2],
    [1],
    newWallet
  );
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});

const swapThreeHops = async (
  testCase: string,
  client: WhirlpoolClient,
  pool0: Whirlpool,
  pool1: Whirlpool,
  pool2: Whirlpool,
  preCreateTokenAccountTwoHops: number[],
  createOneHopTokenAccount: number[],
  wallet: Keypair,
  executeGasless = false
) => {
  console.log("\n\n Test case: ", testCase);
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

  const otherPool2Token = getOtherTokenOfPool(
    pool2,
    new PublicKey(twoHopsSwapToken.pool2OtherToken)
  );

  await createTokenAccounts(
    client,
    [twoHopsSwapToken.pool2OtherToken, otherPool2Token],
    createOneHopTokenAccount,
    wallet.publicKey
  );

  // Swap three hops
  const tx = await getSwapThreeHopsIxs(
    client,
    pool0,
    pool1,
    pool2,
    twoHopsSwapToken,
    wallet
  );

  try {
    console.log("tx size: ", await tx.txnSize());
  } catch (e) {
    console.log("tx failed: ", e);
  }

  // Construct gasless txn
  const dappUtil = await GaslessDapp.new(client.getContext().connection);
  const gaslessTxn = GaslessTransaction.fromTransactionBuilder(
    client.getContext().connection,
    new Wallet(wallet) as CustomWallet,
    tx.compressIx(true),
    dappUtil
  );

  await executeGaslessTx(gaslessTxn, executeGasless);
};

// utils function
const getSwapThreeHopsIxs = async (
  client: WhirlpoolClient,
  pool0: Whirlpool,
  pool1: Whirlpool,
  pool2: Whirlpool,
  twoHopTokens: TwoHopTokens,
  wallet: Keypair
): Promise<TransactionBuilder> => {
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
  let twoHopTx = await client.twoHopSwap(
    quote1,
    pool0,
    quote2,
    pool1,
    new Wallet(wallet)
  );

  // Append a one hop swap
  const intermediaryToken2 = new PublicKey(twoHopTokens.pool2OtherToken);
  const otherPool3Token = getOtherTokenOfPool(pool2, intermediaryToken2);

  const quote3 = await swapQuoteByInputToken(
    pool2,
    intermediaryToken2,
    quote2.estimatedAmountOut,
    SLIPPAGE,
    client.getContext().program.programId,
    client.getContext().fetcher,
    true
  );
  console.log("quote3: ", quote3.estimatedAmountOut.toString());
  const oneHopTx = await pool2.swap(quote3, wallet.publicKey);
  twoHopTx.addInstruction(oneHopTx.compressIx(true));

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
