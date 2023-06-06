import { PublicKey, Keypair } from "@solana/web3.js";
import {
  WhirlpoolsConfigData,
  WhirlpoolIx,
  InitConfigParams,
  toTx,
} from "@renec/redex-sdk";
import { loadProvider, delay, loadWallets } from "./utils";
import { configEnv } from "../env.config";
import fs from "fs";
import readline from "readline";

const retryIntervalInSeconds = 10;

const CONFIG_INFO_PATH = "env.config.ts";

function storeRedexPubToConfigEnv(redexPub: string) {
  const content = `
  export const configEnv = {
    RPC_END_POINT: "${configEnv.RPC_END_POINT}",
    REDEX_PROGRAM_ID: "${configEnv.REDEX_PROGRAM_ID}",
    REDEX_CONFIG_PUB_KEY: "${redexPub}",
    PROTOCOL_FEE_RATE: ${configEnv.PROTOCOL_FEE_RATE},
    FEE_TIERS_TICK_SPACING: ${configEnv.FEE_TIERS_TICK_SPACING},
    FEE_TIERS_DEFAULT_FEE_RATE: ${configEnv.FEE_TIERS_DEFAULT_FEE_RATE},
  };
    `;

  console.log(content);

  fs.writeFile(CONFIG_INFO_PATH, content, (err) => {
    if (err) {
      console.error("Error writing to env.config.ts:", err);
    } else {
      console.log("\n -> Successfully updated env.config.ts\n");
    }
  });
}

async function askForOverideRedexPubkey(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<boolean>((resolve) => {
    rl.question(
      `Do you want to override REDEX_CONFIG_PUB=${configEnv.REDEX_CONFIG_PUB_KEY}? (y/n) `,
      (answer) => {
        rl.close(); // remember to close the interface
        if (answer.toLowerCase() === "y") {
          resolve(true);
        } else {
          resolve(false);
        }
      }
    );
  });
}

async function main() {
  let overrideApproval = await askForOverideRedexPubkey();

  if (!overrideApproval) {
    console.log("Exiting ....");
    process.exit(0);
  }

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

  console.log("deploying redex pool config...");

  const initializedConfigInfo: InitConfigParams = {
    whirlpoolsConfigKeypair: Keypair.generate(),
    feeAuthority: wallets.feeAuthKeypair.publicKey,
    collectProtocolFeesAuthority:
      wallets.collectProtocolFeesAuthKeypair.publicKey,
    rewardEmissionsSuperAuthority:
      wallets.rewardEmissionSupperAuthKeypair.publicKey,
    poolCreatorAuthority: wallets.poolCreatorAuthKeypair.publicKey,
    defaultProtocolFeeRate: configEnv.PROTOCOL_FEE_RATE,
    funder: ctx.wallet.publicKey,
  };

  const tx = toTx(
    ctx,
    WhirlpoolIx.initializeConfigIx(ctx.program, initializedConfigInfo)
  );
  const txid = await tx.buildAndExecute();
  console.log("redex pool config deployed at txid:", txid);

  const redexPubkey =
    initializedConfigInfo.whirlpoolsConfigKeypair.publicKey.toBase58();

  // Store to env.config.ts
  configEnv.REDEX_CONFIG_PUB_KEY = redexPubkey;
  console.log("redex pubkey ", redexPubkey);
  storeRedexPubToConfigEnv(redexPubkey);
  console.log(
    `wait for ${retryIntervalInSeconds} seconds for the config account to be initialized...`
  );
  await delay(retryIntervalInSeconds * 1000);
  console.log(`it's been ${retryIntervalInSeconds} seconds.`);

  let configAccount = (await ctx.fetcher.getConfig(
    new PublicKey(configEnv.REDEX_CONFIG_PUB_KEY)
  )) as WhirlpoolsConfigData;

  console.log("===================================================");
  console.log("ReDEX Pool Config Info:");
  console.log(
    "\x1b[32m%s\x1b[0m",
    `public_key: ${configEnv.REDEX_CONFIG_PUB_KEY}`
  );
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
