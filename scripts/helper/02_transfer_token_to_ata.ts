import { PublicKey, Keypair, Transaction } from "@solana/web3.js";
import {
  getTokenMintInfo,
  loadProvider,
  loadWallets,
} from "../create_pool/utils";
import { deriveATA } from "@orca-so/common-sdk";
import Decimal from "decimal.js";
import { DecimalUtil } from "@orca-so/common-sdk";
import { transfer } from "../create_pool/utils/token";

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
