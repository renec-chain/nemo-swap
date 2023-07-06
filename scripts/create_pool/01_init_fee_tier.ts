import { PublicKey } from "@solana/web3.js";
import {
  WhirlpoolsConfigData,
  WhirlpoolIx,
  InitFeeTierParams,
  toTx,
  PDAUtil,
  FeeTierData,
} from "@renec/redex-sdk";
import { loadProvider, delay, loadWallets } from "./utils";
import { configEnv } from "../env.config";

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
  const REDEX_CONFIG_PUB = new PublicKey(configEnv.REDEX_CONFIG_PUB_KEY);
  const configAccount = (await ctx.fetcher.getConfig(
    REDEX_CONFIG_PUB
  )) as WhirlpoolsConfigData;

  if (configAccount) {
    const feeTierPda = PDAUtil.getFeeTier(
      ctx.program.programId,
      REDEX_CONFIG_PUB,
      configEnv.FEE_TIERS_TICK_SPACING
    );
    let feeTierAccount = (await ctx.fetcher.getFeeTier(
      feeTierPda.publicKey
    )) as FeeTierData;
    if (feeTierAccount) {
      printFeeTier(feeTierPda.publicKey, feeTierAccount);
      return;
    }
    console.log("deploying fee tier account...");
    const params: InitFeeTierParams = {
      feeTierPda,
      whirlpoolsConfig: REDEX_CONFIG_PUB,
      tickSpacing: configEnv.FEE_TIERS_TICK_SPACING,
      defaultFeeRate: configEnv.FEE_TIERS_DEFAULT_FEE_RATE,
      feeAuthority: configAccount.feeAuthority,
      funder: ctx.wallet.publicKey,
    };
    const tx = toTx(
      ctx,
      WhirlpoolIx.initializeFeeTierIx(ctx.program, params)
    ).addSigner(wallets.feeAuthKeypair);
    const txid = await tx.buildAndExecute();
    console.log("fee tier account deployed at txid:", txid);

    await ctx.fetcher.refreshAll();
    feeTierAccount = (await ctx.fetcher.getFeeTier(
      feeTierPda.publicKey
    )) as FeeTierData;
    printFeeTier(feeTierPda.publicKey, feeTierAccount);
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
