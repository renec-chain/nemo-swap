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
import {
  addAddressesToTable,
  createAndSendV0Tx,
  createLookupTable,
  findAddressesInTable,
} from "./";
import { PublicKey } from "@solana/web3.js";

async function main() {
  const poolIndex = parseInt(process.argv[2]);

  const lookupTableAddress = new PublicKey(
    "4Aqor8a9DJtVarvHWGVzHUn8PkXNWCLeFXWRpdXQb3NE"
  );
  const addresses = [
    new PublicKey("So11111111111111111111111111111111111111112"),
    new PublicKey("SysvarRent111111111111111111111111111111111"),
    new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    new PublicKey("7eHTF3hAPbkDbCe5m2mJagZvHjwV68vqzFVe9sKEPWA3"),
  ];

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

  //await createLookupTable(ctx.connection, userKeypair);

  // await addAddressesToTable(
  //   ctx.connection,
  //   userKeypair,
  //   lookupTableAddress,
  //   addresses
  // );

  await findAddressesInTable(ctx.connection, lookupTableAddress);
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
