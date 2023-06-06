import { PublicKey } from "@solana/web3.js";
import {
  WhirlpoolsConfigData,
  WhirlpoolIx,
  InitFeeTierParams,
  toTx,
  PDAUtil,
  FeeTierData,
} from "@renec/redex-sdk";
import { loadProvider, loadWallets } from "./utils";
import config from "./config.json";
import { configEnv } from "../env.config";
import deployed from "./deployed.json";

async function main() {
  const wallets = loadWallets();

  // Check required roles
  if (!wallets.feeAuthKeypair) {
    throw new Error("Please provide fee_authority_wallet wallet");
  }
  const { ctx } = loadProvider(wallets.feeAuthKeypair);

  if (configEnv.REDEX_CONFIG_PUB_KEY === "") {
    console.log(
      "ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` ."
    );
    return;
  }
  const REDEX_CONFIG_PUB = new PublicKey(deployed.REDEX_CONFIG_PUB);
  const configAccount = (await ctx.fetcher.getConfig(
    REDEX_CONFIG_PUB
  )) as WhirlpoolsConfigData;

  if (configAccount) {
    for (let i = 0; i < config.FEE_TIERS.length; i++) {
      const feeTier = config.FEE_TIERS[i];
      const feeTierPda = PDAUtil.getFeeTier(
        ctx.program.programId,
        REDEX_CONFIG_PUB,
        feeTier.TICK_SPACING
      );
      let feeTierAccount = (await ctx.fetcher.getFeeTier(
        feeTierPda.publicKey
      )) as FeeTierData;
      if (feeTierAccount) {
        printFeeTier(feeTierPda.publicKey, feeTierAccount);
        continue;
      }
      console.log("deploying fee tier account...");
      const params: InitFeeTierParams = {
        feeTierPda,
        whirlpoolsConfig: REDEX_CONFIG_PUB,
        tickSpacing: feeTier.TICK_SPACING,
        defaultFeeRate: feeTier.DEFAULT_FEE_RATE,
        feeAuthority: configAccount.feeAuthority,
        funder: ctx.wallet.publicKey,
      };
      const tx = toTx(
        ctx,
        WhirlpoolIx.initializeFeeTierIx(ctx.program, params)
      ).addSigner(wallets.feeAuthKeypair);
      const txid = await tx.buildAndExecute();
      console.log("fee tier account deployed at txid:", txid);
    }
  }
}

function printFeeTier(publicKey: PublicKey, feeTierAccount: FeeTierData) {
  console.log("===================================================");
  console.log("Fee Tier Account Info:");
  console.log("public_key:", publicKey.toBase58());
  console.log("tick_spacing:", feeTierAccount.tickSpacing);
  console.log("default_fee_rate:", feeTierAccount.defaultFeeRate);
  console.log("===================================================");
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
