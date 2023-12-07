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
import { WhirlpoolLookupTable } from "./utils";
import * as fs from "fs";
import {
  loadLookupTable,
  saveDataToLookupTable,
  loadNotCreatedLookupTable,
} from "./utils/helper";

async function main() {
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

  const poolPubkeys = [
    "29FDB74ZayT1e6xLC8TCfVKNkaYUbJ6CXv1oumbq3zJD",
    "GYhNgn31nGFF9DgHkcpNwKFYTNj2Hv15F8bQm3b5CFaq",
  ];
  const client = buildWhirlpoolClient(ctx);

  const notCreatedLookupTable = loadNotCreatedLookupTable();
  let lookupTableData = loadLookupTable();

  // TODO: loop in keys of notCreatedLookupTable data. If key exist in lookup table data, skip it
  let failedPools = [];
  for (const poolPubkey in notCreatedLookupTable) {
    if (notCreatedLookupTable.hasOwnProperty(poolPubkey)) {
      console.log("\n ------------------");

      // Check if the key exists in lookupTableData
      if (lookupTableData.hasOwnProperty(poolPubkey)) {
        console.log(
          `Lookup table already exists for pool: ${poolPubkey}, skipping...`
        );
        continue;
      }

      console.log("Creating lookup table for pool:", poolPubkey);
      const poolAddr = new PublicKey(poolPubkey);
      const whirlpool = await client.getPool(poolAddr);

      try {
        const lookupTable =
          await WhirlpoolLookupTable.createWhirlpoolLookupTable(
            whirlpool,
            ctx,
            userKeypair
          );
        console.log("Lookup table created:", lookupTable.toBase58());
        console.log("Saving lookup table to file...");

        // Reload lookupTableData in case it has been updated since the last load
        lookupTableData = loadLookupTable();
        saveDataToLookupTable(
          lookupTableData,
          poolPubkey,
          lookupTable.toString()
        );
      } catch (error) {
        console.log("ERROR:", error);
        failedPools.push(poolPubkey);
        continue;
      }
    }
  }

  // Save failed pools to file
  console.log("Fail pools:", failedPools);
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
