import { PublicKey } from "@solana/web3.js";
import { WhirlpoolIx, toTx, buildWhirlpoolClient } from "@renec/redex-sdk";
import { loadProvider, loadWallets } from "./utils";
import deployed from "./deployed.json";

// usage: yarn run update-fee-rate-for-pool <pool_address> <new_fee_rate>
const poolAddress = new PublicKey(process.argv[2]);

const newFeeRate = parseInt(process.argv[3]);
if (Number.isNaN(newFeeRate)) {
  console.error("Invalid integer:", process.argv[3]);
} else {
  console.log("Valid integer:", newFeeRate);
}

async function main() {
  const wallets = loadWallets([]);

  // Check required roles
  if (!wallets.feeAuthKeypair) {
    throw new Error("Please provide fee_authority_wallet wallet");
  }

  if (deployed.REDEX_CONFIG_PUB === "") {
    console.log(
      "ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` ."
    );
    return;
  }
  const REDEX_CONFIG_PUB = new PublicKey(deployed.REDEX_CONFIG_PUB);

  const { ctx } = loadProvider(wallets.feeAuthKeypair);
  const client = buildWhirlpoolClient(ctx);
  const whirlpool = await client.getPool(poolAddress);
  const whirlpoolData = whirlpool.getData();
  console.log("=========== Pool info ============");
  console.log("Pool address: ", poolAddress.toBase58());
  console.log("\x1b[32m%s\x1b[0m", `Fee Rate: ${whirlpoolData.feeRate}`);
  console.log("protocolFeeRate: ", whirlpoolData.protocolFeeRate);
  console.log("tickSpacing: ", whirlpoolData.tickSpacing);
  console.log("============================");

  const txid = await toTx(
    ctx,
    WhirlpoolIx.setFeeRateIx(ctx.program, {
      whirlpoolsConfig: REDEX_CONFIG_PUB,
      whirlpool: poolAddress,
      feeAuthority: wallets.feeAuthKeypair.publicKey,
      feeRate: newFeeRate,
    })
  )
    .addSigner(wallets.feeAuthKeypair)
    .buildAndExecute();

  console.log(
    `The new feeRate of ${newFeeRate} has been updated successfully at txid: ${txid}`
  );
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
