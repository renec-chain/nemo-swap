import { PublicKey } from "@solana/web3.js";
import { MathUtil, Percentage } from "@orca-so/common-sdk";
import {
  PDAUtil,
  buildWhirlpoolClient,
  swapQuoteByInputToken,
  swapWithFeeDiscountQuoteByInputToken,
} from "@renec/redex-sdk";
import {
  loadProvider,
  getTokenMintInfo,
  loadWallets,
  ROLES,
} from "../create_pool/utils";
import deployed from "../create_pool//deployed.json";
import { askToConfirmPoolInfo, getPoolInfo } from "../create_pool/utils/pool";
import { u64 } from "@solana/spl-token";
import { GaslessDapp, GaslessTransaction } from "@renec-foundation/gasless-sdk";
import { Wallet } from "@project-serum/anchor";
import { executeGaslessTx } from "./utils";

async function main() {
  const poolIndex = parseInt(process.argv[2]);

  if (isNaN(poolIndex)) {
    console.error("Please provide a valid pool index.");
    return;
  }

  let poolInfo = getPoolInfo(poolIndex);

  const wallets = loadWallets([ROLES.USER]);
  const userKeypair = wallets[ROLES.USER];

  const { ctx } = loadProvider(userKeypair);
  const REDEX_CONFIG_PUB = new PublicKey(deployed.REDEX_CONFIG_PUB);
  const client = buildWhirlpoolClient(ctx);

  await askToConfirmPoolInfo(poolInfo);

  if (!poolInfo.discountTokenMint) {
    console.log("Discount token mint is not found.");
    return;
  }

  const discountTokenMint = new PublicKey(poolInfo.discountTokenMint);

  const mintAPub = new PublicKey(poolInfo.tokenMintA);
  const mintBPub = new PublicKey(poolInfo.tokenMintB);
  const tokenMintA = await getTokenMintInfo(ctx, mintAPub);
  const tokenMintB = await getTokenMintInfo(ctx, mintBPub);

  if (tokenMintA && tokenMintB) {
    const whirlpoolPda = PDAUtil.getWhirlpool(
      ctx.program.programId,
      REDEX_CONFIG_PUB,
      mintAPub,
      mintBPub,
      poolInfo.tickSpacing
    );
    const whirlpool = await client.getPool(whirlpoolPda.publicKey);
    const whirlpoolData = whirlpool.getData();

    const quote = await swapWithFeeDiscountQuoteByInputToken(
      whirlpool,
      discountTokenMint,
      whirlpoolData.tokenMintB,
      new u64(10000000),
      Percentage.fromFraction(1, 100),
      ctx.program.programId,
      ctx.fetcher,
      true
    );

    const tx = await whirlpool.swapWithFeeDiscount(
      quote,
      discountTokenMint,
      userKeypair.publicKey
    );
    tx.addSigner(wallets.userKeypair);
    const txSize = await tx.txnSize();
    console.log("Raw tx size: ", txSize);

    // Construct gasless txn
    const dappUtil = await GaslessDapp.new(client.getContext().connection);
    const gaslessTxn = GaslessTransaction.fromTransactionBuilder(
      client.getContext().connection,
      new Wallet(userKeypair),
      tx.compressIx(true),
      dappUtil
    );

    await executeGaslessTx(gaslessTxn, true);
  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
