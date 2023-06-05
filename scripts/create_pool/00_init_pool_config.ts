import { PublicKey, Keypair } from "@solana/web3.js";
import {
  WhirlpoolsConfigData,
  WhirlpoolIx,
  InitConfigParams,
  toTx,
  SetPoolCreatorAuthorityParams,
} from "@renec/redex-sdk";
import { loadProvider, delay, loadWallets } from "./utils";
import config from "./config.json";
import deployed from "./deployed.json";
const fs = require("fs");
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

  if (deployed.REDEX_CONFIG_PUB === "") {
    console.log("deploying redex pool config...");

    const initializedConfigInfo: InitConfigParams = {
      whirlpoolsConfigKeypair: Keypair.generate(),
      feeAuthority: wallets.feeAuthKeypair.publicKey,
      collectProtocolFeesAuthority:
        wallets.collectProtocolFeesAuthKeypair.publicKey,
      rewardEmissionsSuperAuthority:
        wallets.rewardEmissionSupperAuthKeypair.publicKey,
      poolCreatorAuthority: wallets.poolCreatorAuthKeypair.publicKey,
      defaultProtocolFeeRate: config.PROTOCOL_FEE_RATE,
      funder: ctx.wallet.publicKey,
    };

    const tx = toTx(
      ctx,
      WhirlpoolIx.initializeConfigIx(ctx.program, initializedConfigInfo)
    );
    const txid = await tx.buildAndExecute();
    console.log("redex pool config deployed at txid:", txid);

    deployed.REDEX_CONFIG_PUB =
      initializedConfigInfo.whirlpoolsConfigKeypair.publicKey.toBase58();
    fs.writeFileSync(deployedPath, JSON.stringify(deployed));
    console.log(
      `wait for ${retryIntervalInSeconds} seconds for the config account to be initialized...`
    );
    await delay(retryIntervalInSeconds * 1000);
    console.log(`it's been ${retryIntervalInSeconds} seconds.`);
  }
  // console.log('test change pool creator', wallets.feeAuthKeypair.publicKey.toBase58())
  // const setPoolCreatorAuthorityParams: SetPoolCreatorAuthorityParams = {
  //   whirlpoolsConfig: new PublicKey(deployed.REDEX_CONFIG_PUB),
  //   poolCreatorAuthority: wallets.feeAuthKeypair.publicKey,
  //   newPoolCreatorAuthority: wallets.payerKeypair.publicKey
  // }
  // const tx = toTx(ctx, WhirlpoolIx.setPoolCreatorAuthorityIx(ctx.program, setPoolCreatorAuthorityParams))
  // const txid = await tx.buildAndExecute()
  // console.log('change pool creator at', txid)
  // await delay(10 * 1000)

  let configAccount = (await ctx.fetcher.getConfig(
    new PublicKey(deployed.REDEX_CONFIG_PUB)
  )) as WhirlpoolsConfigData;
  // while (!configAccount) {
  //   console.log(`wait for another ${retryIntervalInSeconds} seconds for the config account to be initialized...`)
  //   await delay(retryIntervalInSeconds * 1000)
  //   console.log(`it's been ${retryIntervalInSeconds} seconds.`)
  //   configAccount = (await ctx.fetcher.getConfig(
  //     new PublicKey(deployed.REDEX_CONFIG_PUB)
  //   )) as WhirlpoolsConfigData
  // }

  console.log("===================================================");
  console.log("ReDEX Pool Config Info:");
  console.log("\x1b[32m%s\x1b[0m", `public_key: ${deployed.REDEX_CONFIG_PUB}`);
  console.log("fee_authority:", configAccount.feeAuthority.toBase58());
  console.log(
    "collect_protocol_fees_authority:",
    configAccount.collectProtocolFeesAuthority.toBase58()
  );
  console.log(
    "reward_emissions_super_authority:",
    configAccount.rewardEmissionsSuperAuthority.toBase58()
  );
  console.log(
    "pool_creator_authority:",
    configAccount.poolCreatorAuthority.toBase58()
  );
  console.log(
    "default_protocol_fee_rate:",
    configAccount.defaultProtocolFeeRate
  );
  console.log("===================================================");
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
