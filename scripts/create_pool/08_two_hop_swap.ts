import { PublicKey, Keypair, Transaction } from "@solana/web3.js";
import { MathUtil, Percentage, deriveATA } from "@orca-so/common-sdk";
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

export function getTokenAccsForPools(
  pools: InitPoolParams[],
  tokenAccounts: { mint: PublicKey; account: PublicKey }[]
) {
  const mints = [];
  for (const pool of pools) {
    mints.push(pool.tokenMintA);
    mints.push(pool.tokenMintB);
  }
  return mints.map(
    (mint) => tokenAccounts.find((acc) => acc.mint === mint)!.account
  );
}

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
    "2Fd4be5sogSNUj4Kb7jKysXQzzovbPncZfGWFXBEPWEh"
  );

  const whirlpoolKey2 = new PublicKey(
    "8TTB5zxvKpsQ5K1pBPrRxj4xVfoRxnJydT3jngB17HUw"
  );
  const client = buildWhirlpoolClient(ctx);
  const whirlpool1 = await client.getPool(whirlpoolKey1, true);
  const whirlpoolData1 = whirlpool1.getData();
  console.log("1 - tokenMintA: ", whirlpoolData1.tokenMintA.toString());
  console.log("1 - tokenMintB: ", whirlpoolData1.tokenMintB.toString());

  console.log("2 - tokenMintA: ", whirlpoolData1.tokenMintA.toString());
  console.log("2 - tokenMintB: ", whirlpoolData1.tokenMintB.toString());

  const whirlpool2 = await client.getPool(whirlpoolKey2, true);
  const whirlpoolData2 = whirlpool1.getData();

  const quote1 = await swapQuoteByInputToken(
    whirlpool1,
    whirlpoolData1.tokenMintB,
    new u64(100),
    Percentage.fromFraction(1, 100),
    ctx.program.programId,
    ctx.fetcher,
    true
  );

  console.log({ quote1 });
  console.log("-------");

  const quote2 = await swapQuoteByInputToken(
    whirlpool2,
    whirlpoolData2.tokenMintB,
    quote1.estimatedAmountOut,
    Percentage.fromFraction(1, 100),
    ctx.program.programId,
    ctx.fetcher,
    true
  );

  console.log({ quote1 });

  const twoHopSwapQuote = twoHopSwapQuoteFromSwapQuotes(quote1, quote2);
  console.log("two hop quotes: ", twoHopSwapQuote);

  const oracleOne = PDAUtil.getOracle(
    ctx.program.programId,
    whirlpoolKey1
  ).publicKey;
  const oracleTwo = PDAUtil.getOracle(
    ctx.program.programId,
    whirlpoolKey2
  ).publicKey;

  console.log("--------");
  const tokenOwnerAccountOneA = new PublicKey(
    "AXKmc6b4vCxU1enqALdsWP8P6tarF5sVXZ8u4ToduqXR"
  );
  const tokenOwnerAccountOneB = new PublicKey(
    "DG17UM3UYXjzgbhw3XdcNSmjZeitos3CMFDgyqX9A9GX"
  );
  const tokenOwnerAccountTwoA = new PublicKey(
    "6dtu56mVxTeRCxbB8EauAp3ehXXzU2p19ApRMdKmJusV"
  );
  const tokenOwnerAccountTwoB = new PublicKey(
    "C7QsPmwB83BfBaYfKDMk1kbnvcioPu2unS8x3MoFpsYT"
  );

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
  console.log({ poolParams });

  const tx = WhirlpoolIx.twoHopSwapIx(ctx.program, {
    ...twoHopSwapQuote,
    ...poolParams,
    tokenAuthority: wallets.userKeypair.publicKey,
  });

  const transaction = new Transaction().add(...tx.instructions);
  transaction.recentBlockhash = (
    await ctx.connection.getLatestBlockhash()
  ).blockhash;
  console.log(wallets.userKeypair.publicKey.toString());
  transaction.sign(wallets.userKeypair);
  const sig = await ctx.connection.sendRawTransaction(transaction.serialize());
  console.log(sig);
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
