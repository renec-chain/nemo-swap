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
import { PublicKey } from "@solana/web3.js";
import { WhirlpoolLookupTable } from "./utils/";
import * as fs from "fs";
import { loadLookupTable, saveDataToLookupTable } from "./utils/helper";

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

    const lookupTable = await WhirlpoolLookupTable.createWhirlpoolLookupTable(
      whirlpool,
      ctx,
      userKeypair
    );

    console.log("Lookup table created:", lookupTable.toBase58());
    console.log("Saving lookup table to file...");

    const lookupTableData = loadLookupTable();
    saveDataToLookupTable(
      lookupTableData,
      whirlpoolPda.publicKey.toString(),
      lookupTable.toString()
    );
  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
