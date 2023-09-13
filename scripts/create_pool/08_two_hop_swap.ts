import { PublicKey } from "@solana/web3.js";
import {
  Percentage,
  resolveOrCreateATAs,
  ZERO,
  TransactionBuilder,
} from "@orca-so/common-sdk";
import {
  PDAUtil,
  buildWhirlpoolClient,
  swapQuoteByInputToken,
  twoHopSwapQuoteFromSwapQuotes,
  WhirlpoolIx,
} from "@renec/redex-sdk";
import { loadProvider, loadWallets } from "./utils";
import deployed from "./deployed.json";
import { u64 } from "@solana/spl-token";

async function main() {
  const wallets = loadWallets();

  const { ctx } = loadProvider(wallets.userKeypair);

  const whirlpoolKey1 = new PublicKey(
    "BQ2sH6LqkhnNZofKXtApHz12frTv1wfbihMg6osMnHx8"
  );

  const whirlpoolKey2 = new PublicKey(
    "7uBREo1HRKmqQvWHahmAU92E3eZNFQBSKffwLx5jGBV7"
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

  console.log("user balance: ", wallets.userKeypair.publicKey.toBase58());

  const amount = new u64(1000000000);
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

  const txBuilder = new TransactionBuilder(ctx.connection, ctx.wallet);

  const [resolvedAtaOneA, resolvedAtaOneB, resolvedAtaTwoA, resolvedAtaTwoB] =
    await resolveOrCreateATAs(
      ctx.connection,
      wallets.userKeypair.publicKey,
      [
        { tokenMint: whirlpoolData1.tokenMintA, wrappedSolAmountIn: amount },
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

  createATAInstructions.push(tokenOwnerAccountOneAIx);
  createATAInstructions.push(tokenOwnerAccountOneBIx);
  createATAInstructions.push(tokenOwnerAccountTwoAIx);
  if (createATAInstructions.length) {
    console.log(
      `add: ${createATAInstructions.length} create ATAs account instructions`
    );
    txBuilder.addInstructions(createATAInstructions);
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

  const ix = WhirlpoolIx.twoHopSwapIx(ctx.program, {
    ...twoHopSwapQuote,
    ...poolParams,
    tokenAuthority: wallets.userKeypair.publicKey,
  });

  const tx = await txBuilder
    .addInstruction(ix)
    .addSigner(wallets.userKeypair)
    .buildAndExecute();

  console.log("transaction: ", tx);
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
