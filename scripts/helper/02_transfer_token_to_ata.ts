import { PublicKey, Keypair, Transaction } from "@solana/web3.js";
import {
  buildWhirlpoolClient,
  WhirlpoolIx,
  toTx,
  WhirlpoolContext,
  InitializeRewardParams,
} from "@renec/redex-sdk";
import { Whirlpool } from "@renec/redex-sdk/src";
import {
  getTokenMintInfo,
  loadProvider,
  loadWallets,
} from "../create_pool/utils";
import { deriveATA } from "@orca-so/common-sdk";
import { AnchorProvider } from "@project-serum/anchor";
import { Token, TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
import Decimal from "decimal.js";
import { DecimalUtil, Percentage } from "@orca-so/common-sdk";

export async function transfer(
  provider: AnchorProvider,
  source: PublicKey,
  destination: PublicKey,
  amount: number | u64
) {
  const tx = new Transaction();
  tx.add(
    Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      source,
      destination,
      provider.wallet.publicKey,
      [],
      amount
    )
  );
  return provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
}

//usage: yarn set_pool_reward <pool_address> <reward_token_mint> <reward_index?>
async function main() {
  // Load context
  const wallets = loadWallets();
  const userAuth = wallets.userKeypair;
  const { ctx } = loadProvider(userAuth);

  const tokenMint = new PublicKey(process.argv[2]);
  const tokenAccount = await deriveATA(userAuth.publicKey, tokenMint);
  const ataAddress = new PublicKey(process.argv[3]);

  const tokenAmount = new Decimal(process.argv[4]);
  const tokenInfo = await getTokenMintInfo(ctx, tokenMint);
  const tokenAmountU64 = DecimalUtil.toU64(tokenAmount, tokenInfo.decimals);

  const hash = await transfer(
    ctx.provider,
    tokenAccount,
    ataAddress,
    tokenAmountU64
  );
  console.log("hash:", hash);
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
