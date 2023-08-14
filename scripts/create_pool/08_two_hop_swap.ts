import { PublicKey, Keypair, Transaction } from "@solana/web3.js";
import {
  MathUtil,
  Percentage,
  deriveATA,
  resolveOrCreateATAs,
  ZERO
} from "@orca-so/common-sdk";
import {
  PDAUtil,
  buildWhirlpoolClient,
  PriceMath,
  swapQuoteByInputToken,
  twoHopSwapQuoteFromSwapQuotes,
  WhirlpoolIx,
  InitPoolParams,
  WhirlpoolContext,
} from "@renec/redex-sdk";
import { loadProvider, getTokenMintInfo, loadWallets } from "./utils";
import Decimal from "decimal.js";
import config from "./config.json";
import deployed from "./deployed.json";
import { askToConfirmPoolInfo, getPoolInfo } from "./utils/pool";
import { u64, Token } from "@solana/spl-token";
import { Instruction } from "@project-serum/anchor";

async function main() {
  const wallets = loadWallets();

  if (!wallets.poolCreatorAuthKeypair) {
    throw new Error("Please provide pool_creator_authority_wallet wallet");
  }

  const { ctx } = loadProvider(wallets.poolCreatorAuthKeypair);

  if (deployed.REDEX_CONFIG_PUB === "") {
    console.log(
      "ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` ."
    );
    return;
  }

  const whirlpoolKey1 = new PublicKey(
    "HmruH4dvo1FdsLNDpFFnurtm6ih3YhwcbiDNnHu8bec2"
  );

  const whirlpoolKey2 = new PublicKey(
    "7BL2mnqmFErEKpx4EwTTXXmjn4BvxUzD5Nrgr7afj1Q9"
  );
  const client = buildWhirlpoolClient(ctx);
  const whirlpool1 = await client.getPool(whirlpoolKey1, true);
  const whirlpoolData1 = whirlpool1.getData();
  console.log("pool 1 - tokenMintA: ", whirlpoolData1.tokenMintA.toString());
  console.log("pool 1 - tokenMintB: ", whirlpoolData1.tokenMintB.toString());

  const whirlpool2 = await client.getPool(whirlpoolKey2, true);
  const whirlpoolData2 = whirlpool2.getData();

  console.log("pool 2 - tokenMintA: ", whirlpoolData2.tokenMintA.toString());
  console.log("pool 2 - tokenMintB: ", whirlpoolData2.tokenMintB.toString());
  const amount = new u64(1000);
  const quote1 = await swapQuoteByInputToken(
    whirlpool1,
    whirlpoolData1.tokenMintB,
    amount,
    Percentage.fromFraction(1, 100),
    ctx.program.programId,
    ctx.fetcher,
    true
  );

  const quote2 = await swapQuoteByInputToken(
    whirlpool2,
    whirlpoolData2.tokenMintB,
    quote1.estimatedAmountOut,
    Percentage.fromFraction(1, 100),
    ctx.program.programId,
    ctx.fetcher,
    true
  );

  const twoHopSwapQuote = twoHopSwapQuoteFromSwapQuotes(quote1, quote2);

  const oracleOne = PDAUtil.getOracle(
    ctx.program.programId,
    whirlpoolKey1
  ).publicKey;
  const oracleTwo = PDAUtil.getOracle(
    ctx.program.programId,
    whirlpoolKey2
  ).publicKey;

  const transactions = new Transaction();

  const [resolvedAtaOneA, resolvedAtaOneB, resolvedAtaTwoA, resolvedAtaTwoB] =
    await resolveOrCreateATAs(
      ctx.connection,
      wallets.userKeypair.publicKey,
      [
        { tokenMint: whirlpoolData1.tokenMintA, wrappedSolAmountIn: ZERO },
        { tokenMint: whirlpoolData1.tokenMintB, wrappedSolAmountIn: ZERO },
        { tokenMint: whirlpoolData2.tokenMintA, wrappedSolAmountIn: ZERO },
        { tokenMint: whirlpoolData2.tokenMintB, wrappedSolAmountIn: ZERO },
      ],
      () => ctx.fetcher.getAccountRentExempt()
    );
  const createATAInstructions = [];
  const { address: tokenOwnerAccountOneA, ...tokenOwnerAccountOneAIx } =
    resolvedAtaOneA;
  const { address: tokenOwnerAccountOneB, ...tokenOwnerAccountOneBIx } =
    resolvedAtaOneB;
  const { address: tokenOwnerAccountTwoA, ...tokenOwnerAccountTwoAIx } =
    resolvedAtaTwoA;
  const { address: tokenOwnerAccountTwoB, ...tokenOwnerAccountTwoBIx } =
    resolvedAtaTwoB;

  createATAInstructions.push(...tokenOwnerAccountOneAIx.instructions);
  createATAInstructions.push(...tokenOwnerAccountOneBIx.instructions);
  createATAInstructions.push(...tokenOwnerAccountTwoAIx.instructions);
  createATAInstructions.push(...tokenOwnerAccountTwoBIx.instructions);
  if (createATAInstructions.length) {
    console.log(`add: ${createATAInstructions.length} create ATAs account instructions`)
    transactions.add(...createATAInstructions);
  }

  const poolParams = {
    whirlpoolOne: whirlpoolKey1,
    whirlpoolTwo: whirlpoolKey2,
    tokenOwnerAccountOneA: tokenOwnerAccountOneA,
    tokenVaultOneA: whirlpoolData1.tokenVaultA,
    tokenOwnerAccountOneB: tokenOwnerAccountOneB,
    tokenVaultOneB: whirlpoolData1.tokenVaultB,
    tokenOwnerAccountTwoA: tokenOwnerAccountTwoA,
    tokenVaultTwoA: whirlpoolData2.tokenVaultA,
    tokenOwnerAccountTwoB: tokenOwnerAccountTwoB,
    tokenVaultTwoB: whirlpoolData2.tokenVaultB,
    oracleOne,
    oracleTwo,
  };

  const tx = WhirlpoolIx.twoHopSwapIx(ctx.program, {
    ...twoHopSwapQuote,
    ...poolParams,
    tokenAuthority: wallets.userKeypair.publicKey,
  });

  const transaction = transactions.add(...tx.instructions);
  transaction.recentBlockhash = (
    await ctx.connection.getLatestBlockhash()
  ).blockhash;
  transaction.sign(wallets.userKeypair);
  const sig = await ctx.connection.sendRawTransaction(transaction.serialize());
  console.log("transaction: ", sig);
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
