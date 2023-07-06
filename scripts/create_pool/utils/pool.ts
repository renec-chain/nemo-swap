import readline from "readline";
import Decimal from "decimal.js";
import config from "../config.json";
import { PoolUtil, WhirlpoolsConfigData } from "@renec/redex-sdk";
import { PoolInfo } from "./types";
import { PublicKey } from "@solana/web3.js";
import { configEnv } from "../../env.config";
import { poolEnv } from "../../env.pool";
import fs from "fs";
import { CONFIG_INFO_PATH } from "../../consts";

export async function askToConfirmPoolInfo(poolInfo: PoolInfo): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let message = "";
  if (poolInfo.isTokenReversed) {
    message =
      "\n---> WARNING: This pool token order is reversed, and the correct pool information is adjusted as the following.\n";
  }
  await new Promise<void>((resolve) => {
    rl.question(
      ` ${message} \n
        This is your pool information: 
          -----------------------------------------------
          token_a: ${poolInfo.tokenMintA}  
          token_b: ${poolInfo.tokenMintB} 
          tick_spacing: ${poolInfo.tickSpacing} 
          price_b_per_a: ${poolInfo.initialAmountBPerA.toFixed(6)} 
          lower_b_per_a_price: ${poolInfo.lowerBPerAPrice.toFixed(6)} 
          upper_b_per_a_price: ${poolInfo.upperBPerAPrice.toFixed(6)} 
          slippage: ${poolInfo.slippage.toFixed(6)} 
          input_mint: ${poolInfo.inputMint} 
          input_amount: ${poolInfo.inputAmount.toFixed(6)}
          -----------------------------------------------
          Do you want to proceed? (y/n) `,
      (answer) => {
        rl.close();
        if (answer.toLowerCase() !== "y") {
          console.log("Aborting ....");
          process.exit(0);
        }
        resolve();
      }
    );
  });
}

export async function askToConfirmConfig(
  configPubkey: string,
  configInfo: WhirlpoolsConfigData
): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let message = "";

  await new Promise<void>((resolve) => {
    rl.question(
      ` ${message} \n
        This is the existing pool config information: 

        CONFIG_PUB_KEY: ${configPubkey}
          -----------------------------------------------
          fee_authority: ${configInfo.feeAuthority}  
          collect_protocol_fees_authority: ${configInfo.collectProtocolFeesAuthority}
          reward_emissions_supper_authority: ${configInfo.rewardEmissionsSuperAuthority}
          pool_creator_authority: ${configInfo.poolCreatorAuthority}
          default_fee_rate: ${configInfo.defaultProtocolFeeRate}
          -----------------------------------------------
          By proceeding, the new CONFIG_PUB_KEY will be overrided. Do you want to proceed? (y/n) `,
      (answer) => {
        rl.close();
        if (answer.toLowerCase() !== "y") {
          console.log("Aborting ....");
          process.exit(0);
        }
        resolve();
      }
    );
  });
}

export async function saveConfigInfo(config: typeof configEnv) {
  const content = `
  export const configEnv = {
    RPC_END_POINT: "${config.RPC_END_POINT}",
    REDEX_PROGRAM_ID: "${config.REDEX_PROGRAM_ID}",
    REDEX_CONFIG_PUB: "${config.REDEX_CONFIG_PUB}",
    PROTOCOL_FEE_RATE: ${config.PROTOCOL_FEE_RATE},
    FEE_TIERS_TICK_SPACING: ${config.FEE_TIERS_TICK_SPACING},
    FEE_TIERS_DEFAULT_FEE_RATE: ${config.FEE_TIERS_DEFAULT_FEE_RATE},
  };
    `;

  fs.writeFile(CONFIG_INFO_PATH, content, (err) => {
    if (err) {
      console.error("Error writing to env.config.ts:", err);
    } else {
      console.log("Successfully updated env.config.ts\n");
    }
  });
}

export async function showConfigInfo() {
  fs.readFile(CONFIG_INFO_PATH, "utf8", function (err, data) {
    if (err) {
      console.log("\n\n **_** Error reading env.config.ts:", err);
    } else {
      console.log("=======================================================");
      console.log(data);
      console.log("=======================================================");
    }
  });
}

export function checkTokenReversed(
  configTokenA: string,
  configTokenB: string,
  sortedTokenA: string,
  sortedTokenB: string
): boolean {
  if (configTokenA === sortedTokenA && configTokenB === sortedTokenB) {
    return false;
  } else if (configTokenA === sortedTokenB && configTokenB === sortedTokenA) {
    return true;
  } else {
    throw new Error("Token order is not matched");
  }
}

export function getPoolInfo(): PoolInfo {
  const correctTokenOrder = PoolUtil.orderMints(
    poolEnv.TOKEN_MINT_A,
    poolEnv.TOKEN_MINT_B
  );

  let mintAPub = correctTokenOrder[0].toString();
  let mintBPub = correctTokenOrder[1].toString();

  // Check if pool is reversed
  let isTokenReversed = checkTokenReversed(
    poolEnv.TOKEN_MINT_A,
    poolEnv.TOKEN_MINT_B,
    mintAPub,
    mintBPub
  );

  // Get default poolEnv info
  let initialAmountBPerA = new Decimal(poolEnv.INIT_AMOUNT_B_PER_A);
  let lowerBPerAPrice = new Decimal(poolEnv.LOWER_B_PER_A_PRICE);
  let upperBPerAPrice = new Decimal(poolEnv.UPPER_B_PER_A_PRICE);

  let correctInitialAmountBPerA = initialAmountBPerA;
  let correctLowerBPerAPrice = lowerBPerAPrice;
  let correctUpperBPerAPrice = upperBPerAPrice;

  // Get correct poolEnv info
  if (isTokenReversed) {
    correctInitialAmountBPerA = initialAmountBPerA.pow(-1);
    correctLowerBPerAPrice = upperBPerAPrice.pow(-1);
    correctUpperBPerAPrice = lowerBPerAPrice.pow(-1);
  }

  return {
    isTokenReversed,
    tokenMintA: mintAPub,
    tokenMintB: mintBPub,
    tickSpacing: poolEnv.TICK_SPACING,
    initialAmountBPerA: correctInitialAmountBPerA,
    lowerBPerAPrice: correctLowerBPerAPrice,
    upperBPerAPrice: correctUpperBPerAPrice,
    slippage: new Decimal(poolEnv.SLIPPAGE),
    inputMint: poolEnv.INPUT_MINT,
    inputAmount: new Decimal(poolEnv.INPUT_AMOUNT),
  };
}
