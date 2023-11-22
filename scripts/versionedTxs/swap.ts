import { MathUtil, Percentage } from "@orca-so/common-sdk";
import {
  PDAUtil,
  buildWhirlpoolClient,
  swapQuoteByInputToken,
} from "@renec/redex-sdk";
import {
  loadProvider,
  getTokenMintInfo,
  loadWallets,
  ROLES,
} from "../create_pool/utils";
import deployed from "../create_pool/deployed.json";
import { getPoolInfo } from "../create_pool/utils/pool";
import { u64 } from "@solana/spl-token";
import { compareTxSize, createAndSendV0Tx } from "./";
import {
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

async function main() {
  const poolIndex = parseInt(process.argv[2]);

  if (isNaN(poolIndex)) {
    console.error("Please provide a valid pool index.");
    return;
  }

  let poolInfo = getPoolInfo(poolIndex);

  const wallets = loadWallets([ROLES.USER]);
  const userKeypair = wallets[ROLES.USER];

  if (!userKeypair) {
    console.error("Please provide a valid user wallet.");
    return;
  }

  const { ctx } = loadProvider(userKeypair);

  if (deployed.REDEX_CONFIG_PUB === "") {
    console.log(
      "ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` ."
    );
    return;
  }
  const REDEX_CONFIG_PUB = new PublicKey(deployed.REDEX_CONFIG_PUB);
  const client = buildWhirlpoolClient(ctx);

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

    console.log("Token mint a: ", whirlpoolData.tokenMintA.toString());
    console.log("Token mint b: ", whirlpoolData.tokenMintB.toString());

    const quote = await swapQuoteByInputToken(
      whirlpool,
      whirlpoolData.tokenMintB,
      new u64(100000),
      Percentage.fromFraction(1, 100),
      ctx.program.programId,
      ctx.fetcher,
      true
    );
    const tx = await whirlpool.swap(quote, userKeypair.publicKey);

    // const hash = await tx.buildAndExecute();

    const ixs = tx.compressIx(true);

    const instructions = ixs.instructions.concat(ixs.cleanupInstructions);
    const lookupTableAddress = new PublicKey(
      "Gr7i5MRRRhBQ9Wxf7oNRqKaKY4fAapk8WhDgkMH1u6nU"
    );

    await compareTxSize(ctx.connection, userKeypair, instructions, [
      lookupTableAddress,
    ]);
  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
