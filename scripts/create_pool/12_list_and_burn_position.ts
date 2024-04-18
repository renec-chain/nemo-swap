import { buildWhirlpoolClient } from '@renec/redex-sdk';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

import deployed from './deployed.json';
import {
  loadProvider,
  loadWallets,
} from './utils';

async function main() {
  const wallets = loadWallets();

  if (!wallets.userKeypair) {
    throw new Error("Please provide user_wallet wallet");
  }

  const { ctx } = loadProvider(wallets.userKeypair);
  if (deployed.REDEX_CONFIG_PUB === "") {
    console.log(
      "ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` ."
    );
    return;
  }

  const client = buildWhirlpoolClient(ctx);
  const positions = await client.getAllPositionsOf(ctx.wallet.publicKey);

  console.log("Number of positions: ", positions.length);
  for (let i = 0; i < positions.length; i++) {
    let position = positions[i].getData();
    console.log(position.positionMint.toString())
    console.log(position.whirlpool.toString())

    // Step 1 - Fetch Associated Token Account Address
    console.log(`Step 1 - Fetch Token Account`);
    const account = await Token.getAssociatedTokenAddress(ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, position.positionMint, wallets.userKeypair.publicKey)
    console.log(`    ✅ - Associated Token Account Address: ${account.toString()}`);

    // Step 2 - Create Burn Instructions
    console.log(`Step 2 - Create Burn Instructions`);
    const burnIx = Token.createBurnInstruction(
      TOKEN_PROGRAM_ID,
      position.positionMint,
      account,
      wallets.userKeypair.publicKey,
      [],
      1
    )
    console.log(`    ✅ - Burn Instruction Created`);

    // Step 3 - Execute tx
    const recentBlockhash = await ctx.connection.getLatestBlockhash();
    console.log(`Step 4 - Assemble Transaction`);
    const messageV0 = new TransactionMessage({
      payerKey: wallets.userKeypair.publicKey,
      recentBlockhash: recentBlockhash.blockhash,
      instructions: [burnIx]
    }).compileToV0Message();
    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([wallets.userKeypair]);

    // const txid = await ctx.connection.sendTransaction(transaction);
    // console.log("    ✅ - Transaction sent to network");


    console.log('🔥 SUCCESSFUL BURN!🔥', '\n', txid);

  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
