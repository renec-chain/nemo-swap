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
import { getTwoHopSwapTokens } from "./utils/swap";
import { u64 } from "@solana/spl-token";
import {
  GaslessDapp,
  GaslessTransaction,
  sendToGasless,
} from "@renec-foundation/gasless-sdk";

const SLIPPAGE = Percentage.fromFraction(1, 100);

async function main() {
  const config = getConfig();

  const wallets = loadWallets([ROLES.TOKEN_MINT_AUTH]);
  const tokenMintAuth = wallets[ROLES.TOKEN_MINT_AUTH];

  // Generate new wallets for testing
  const { ctx } = loadProvider(tokenMintAuth);
  const client = buildWhirlpoolClient(ctx);
  const newWallet = await genNewWallet(ctx.connection);
  console.log("new wallet:", newWallet.publicKey.toString());

  const poolInfo0 = getPoolInfo(0);
  const poolInfo1 = getPoolInfo(1);

  const pool0 = await getWhirlPool(client, poolInfo0);
  const pool1 = await getWhirlPool(client, poolInfo1);

  // GEt swap tokens
  const twoHopTokens = getTwoHopSwapTokens(poolInfo0, poolInfo1);

  // Generate discount token
  const discountToken = new PublicKey(config.DISCOUNT_TOKEN);
  await mintToByAuthority(
    ctx.provider,
    discountToken,
    newWallet.publicKey,
    10000
  );

  // Get swap quote
  const amount = new u64(100);
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

  // two hop swap
  const tx = await client.twoHopSwapWithFeeDiscount(
    quote1,
    pool0,
    quote2,
    pool1,
    discountToken,
    newWallet
  );

  const rawSize = await tx.txnSize();
  console.log("raw size:", rawSize);

  const buildTx = await tx.build();
  const buildSize = buildTx.transaction.serialize({
    verifySignatures: false,
    requireAllSignatures: false,
  }).length;
  console.log("build size:", buildSize);

  process.exit(0);
  // Construct gasless txn
  const dappUtil = await GaslessDapp.new(ctx.connection);
  const gaslessTxn = GaslessTransaction.fromTransactionBuilder(
    ctx.connection,
    newWallet as CustomWallet,
    tx.compressIx(true),
    dappUtil
  );

  // const txId = gaslessTxn.asyncBuildAndExecute((error: any, txId: string) => {
  //   if (error) {
  //     console.log("error:", error);
  //   } else {
  //     console.log("txId:", txId);
  //   }
  // });

  const transaction = await gaslessTxn.build();

  const txSize = transaction.serialize({
    verifySignatures: false,
    requireAllSignatures: false,
  }).length;

  console.log("Tx size: ", txSize);
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});

const txSize = async (connection: Connection) => {
  let recentBlockhash = await connection.getLatestBlockhash();
};
