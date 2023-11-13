import { PublicKey } from "@solana/web3.js";
import {
  WhirlpoolsConfigData,
  WhirlpoolIx,
  InitFeeTierParams,
  toTx,
  PDAUtil,
  FeeTierData,
} from "@renec/redex-sdk";
import { loadProvider, delay, loadWallets, getConfig } from "./utils";
import deployed from "./deployed.json";
const config = getConfig();

async function main() {
  const wallets = loadWallets([ROLES.FEE_AUTH, ROLES.USER]);
  const feeAuthKeypair = wallets[ROLES.FEE_AUTH];
  const userKeypair = wallets[ROLES.USER];

  // Check required roles
  if (!wallets.feeAuthKeypair) {
    throw new Error("Please provide fee_authority_wallet wallet");
  }

  if (!wallets.userKeypair) {
    throw new Error("Please provide user_wallet wallet");
  }

  console.log("fee auth: ", wallets.feeAuthKeypair.publicKey.toString());

  const { ctx } = loadProvider(wallets.userKeypair);

  if (deployed.REDEX_CONFIG_PUB === "") {
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
      console.log("------------");
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
      ).addSigner(feeAuthKeypair);
      const txid = await tx.buildAndExecute();
      console.log("fee tier account deployed at txid:", txid);
      feeTierAccount = (await ctx.fetcher.getFeeTier(
        feeTierPda.publicKey,
        true
      )) as FeeTierData;
      printFeeTier(feeTierPda.publicKey, feeTierAccount);
    }
  }
}

function printFeeTier(publicKey: PublicKey, feeTierAccount: FeeTierData) {
  console.log("===================================================");
  console.log("Fee Tier Account Info:");
  console.log("public_key:", publicKey.toBase58());
  console.log("tick_spacing:", feeTierAccount.tickSpacing);
  console.log(
    `default_fee_rate: ${(feeTierAccount.defaultFeeRate / MAX_FEE_RATE) * 100}%`
  );
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
