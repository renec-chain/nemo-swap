import { PublicKey, Keypair, Transaction } from "@solana/web3.js";
import {
  PDAUtil,
  buildWhirlpoolClient,
  PoolUtil,
  toTx,
} from "@renec/redex-sdk";
import {
  loadProvider,
  loadWallets,
  ROLES,
  TickSpacing,
} from "../create_pool/utils";
import { deriveATA } from "@orca-so/common-sdk";
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";
import Decimal from "decimal.js";
import { DecimalUtil } from "@orca-so/common-sdk";

// usage: ts-node helper/02_transfer_token_to_ata_address.ts <token_mint> <ata_address> <amount>
async function main() {
  const tokenMintStr = process.argv[2];
  if (!tokenMintStr) {
    throw new Error("Please provide a token mint as the first argument");
  }
  const tokenMint = new PublicKey(tokenMintStr);

  const ataAddressStr = process.argv[3];
  if (!ataAddressStr) {
    throw new Error("Please provide the ata address as the second argument");
  }
  const vaultAtaAddress = new PublicKey(ataAddressStr);

  const amountStr = process.argv[4];
  if (!amountStr) {
    throw new Error("Please provide the amount as the third argument");
  }
  const amount = new Decimal(amountStr);

  // Load context
  const wallets = loadWallets([ROLES.USER]);
  const userAuth = wallets[ROLES.USER];
  const { ctx } = loadProvider(userAuth);

  // get token info
  const tokenMintInfo = await ctx.fetcher.getMintInfo(tokenMint, true);

  // transfer tx
  const userTokenAccount = await deriveATA(userAuth.publicKey, tokenMint);

  const transferIx = Token.createTransferInstruction(
    TOKEN_PROGRAM_ID,
    userTokenAccount,
    vaultAtaAddress,
    userAuth.publicKey,
    [],
    DecimalUtil.toU64(amount, tokenMintInfo.decimals).toNumber()
  );

  const tx = new Transaction().add(transferIx);

  // Sign and send the transaction
  tx.recentBlockhash = (await ctx.connection.getLatestBlockhash()).blockhash;
  tx.sign(userAuth);
  const txid = await ctx.provider.sendAndConfirm(tx);

  console.log(`Transaction sent: ${txid}`);
  console.log("===================================================");
  const vaultBalance = await ctx.connection.getTokenAccountBalance(
    vaultAtaAddress
  );
  console.log("Token mint: ", tokenMint.toBase58());
  console.log("Token vault: ", vaultAtaAddress.toBase58());
  console.log("Vault balance:", vaultBalance.value.uiAmount);
  console.log("===================================================");
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
