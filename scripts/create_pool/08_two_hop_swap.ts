import { PublicKey, Transaction } from "@solana/web3.js";
import { Percentage, resolveOrCreateATAs, ZERO } from "@orca-so/common-sdk";
import {
  PDAUtil,
  buildWhirlpoolClient,
  swapQuoteByInputToken,
  twoHopSwapQuoteFromSwapQuotes,
  WhirlpoolIx,
} from "@renec/redex-sdk";
import { loadProvider, loadWallets } from "./utils";
import deployed from "./deployed.json";
import { askToConfirmPoolInfo, getPoolInfo } from "./utils/pool";
import { u64, Token, NATIVE_MINT } from "@solana/spl-token";
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
    "BQ2sH6LqkhnNZofKXtApHz12frTv1wfbihMg6osMnHx8"
  );

  const whirlpoolKey2 = new PublicKey(
    "7uBREo1HRKmqQvWHahmAU92E3eZNFQBSKffwLx5jGBV7"
  );

  // pool reVND/reUSD : 7uBREo1HRKmqQvWHahmAU92E3eZNFQBSKffwLx5jGBV7
  // pool RENEC/ reusd: BQ2sH6LqkhnNZofKXtApHz12frTv1wfbihMg6osMnHx8

  const client = buildWhirlpoolClient(ctx);

  // load
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
    whirlpoolData1.tokenMintA,
    amount,
    Percentage.fromFraction(1, 100),
    ctx.program.programId,
    ctx.fetcher,
    true
  );

  const quote2 = await swapQuoteByInputToken(
    whirlpool2,
    whirlpoolData2.tokenMintA,
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
      () => ctx.fetcher.getAccountRentExempt(),
      wallets.userKeypair.publicKey,
      true
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
  const signersATAs = [];
  signersATAs.push(...tokenOwnerAccountOneAIx.signers);
  signersATAs.push(...tokenOwnerAccountOneBIx.signers);
  signersATAs.push(...tokenOwnerAccountTwoAIx.signers);
  signersATAs.push(...tokenOwnerAccountTwoBIx.signers);
  if (createATAInstructions.length) {
    console.log(
      `add: ${createATAInstructions.length} create ATAs account instructions`
    );
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

  transactions.add(...tx.instructions);

  transactions.recentBlockhash = (
    await ctx.connection.getLatestBlockhash()
  ).blockhash;
  transactions.feePayer = wallets.userKeypair.publicKey;
  transactions.sign(wallets.userKeypair, ...signersATAs);

  const sig = await ctx.connection.sendRawTransaction(transactions.serialize());
  console.log("transaction: ", sig);
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});

// Input : client, pool1, pool2,
