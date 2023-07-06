import { PublicKey, Keypair } from "@solana/web3.js";
import {
  WhirlpoolsConfigData,
  WhirlpoolIx,
  InitConfigParams,
  toTx,
} from "@renec/redex-sdk";
import { loadProvider, delay, loadWallets } from "./utils";
import fs from "fs";
import { configEnv } from "../env.config";
import { askToConfirmConfig } from "./utils/pool";
const deployedPath = "./create_pool/deployed.json";
const retryIntervalInSeconds = 10;

async function main() {
  const wallets = loadWallets();

  // Check required roles
  if (!wallets.deployerKeypair) {
    throw new Error("Please provide deployer_wallet wallet");
  }

  if (!wallets.collectProtocolFeesAuthKeypair) {
    throw new Error(
      "Please provide collect_protocol_fees_authority_wallet wallet"
    );
  }

  if (!wallets.feeAuthKeypair) {
    throw new Error("Please provide fee_authority_wallet wallet");
  }

  if (!wallets.rewardEmissionSupperAuthKeypair) {
    throw new Error(
      "Please provide reward_emissions_supper_authority_wallet wallet"
    );
  }

  if (!wallets.poolCreatorAuthKeypair) {
    throw new Error("Please provide pool_creator_authority_wallet wallet");
  }

  const { ctx } = loadProvider(wallets.deployerKeypair);

  // Get existing pool config info
  let configData = await ctx.fetcher.getConfig(
    new PublicKey(configEnv.REDEX_CONFIG_PUB_KEY)
  );

  if (configData != null) {
    askToConfirmConfig(configEnv.REDEX_CONFIG_PUB_KEY, configData);
  }

  // // init pool
  // const initializedConfigInfo: InitConfigParams = {
  //   whirlpoolsConfigKeypair: Keypair.generate(),
  //   feeAuthority: wallets.feeAuthKeypair.publicKey,
  //   collectProtocolFeesAuthority:
  //     wallets.collectProtocolFeesAuthKeypair.publicKey,
  //   rewardEmissionsSuperAuthority:
  //     wallets.rewardEmissionSupperAuthKeypair.publicKey,
  //   poolCreatorAuthority: wallets.poolCreatorAuthKeypair.publicKey,
  //   defaultProtocolFeeRate: configEnv.PROTOCOL_FEE_RATE,
  //   funder: ctx.wallet.publicKey,
  // };

  // const tx = toTx(
  //   ctx,
  //   WhirlpoolIx.initializeConfigIx(ctx.program, initializedConfigInfo)
  // );
  // const txid = await tx.buildAndExecute();
  // console.log("redex pool config deployed at txid:", txid);

  // console.log("===================================================");
  // console.log("ReDEX Pool Config Info:");
  // console.log("\x1b[32m%s\x1b[0m", `public_key: ${deployed.REDEX_CONFIG_PUB}`);
  // console.log("fee_authority:", configAccount.feeAuthority.toBase58());
  // console.log(
  //   "collect_protocol_fees_authority:",
  //   configAccount.collectProtocolFeesAuthority.toBase58()
  // );
  // console.log(
  //   "reward_emissions_super_authority:",
  //   configAccount.rewardEmissionsSuperAuthority.toBase58()
  // );
  // console.log(
  //   "pool_creator_authority:",
  //   configAccount.poolCreatorAuthority.toBase58()
  // );
  // console.log(
  //   "default_protocol_fee_rate:",
  //   configAccount.defaultProtocolFeeRate
  // );
  // console.log("===================================================");
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
