import readline from "readline";
import Decimal from "decimal.js";
import config from "../config.json";
import { PoolUtil } from "@renec/redex-sdk";
import { PoolInfo } from "./types";

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

export function getPoolInfo(poolIndex: number): PoolInfo {
  let pool = config.POOLS[poolIndex];

  const correctTokenOrder = PoolUtil.orderMints(
    pool.TOKEN_MINT_A,
    pool.TOKEN_MINT_B
  );

  let mintAPub = correctTokenOrder[0].toString();
  let mintBPub = correctTokenOrder[1].toString();

  // Check if pool is reversed
  let isTokenReversed = checkTokenReversed(
    pool.TOKEN_MINT_A,
    pool.TOKEN_MINT_B,
    mintAPub,
    mintBPub
  );

  // Get default pool info
  let initialAmountBPerA = new Decimal(pool.INIT_AMOUNT_B_PER_A);
  let lowerBPerAPrice = new Decimal(pool.LOWER_B_PER_A_PRICE);
  let upperBPerAPrice = new Decimal(pool.UPPER_B_PER_A_PRICE);

  let correctInitialAmountBPerA = initialAmountBPerA;
  let correctLowerBPerAPrice = lowerBPerAPrice;
  let correctUpperBPerAPrice = upperBPerAPrice;

  // Get correct pool info
  if (isTokenReversed) {
    correctInitialAmountBPerA = initialAmountBPerA.pow(-1);
    correctLowerBPerAPrice = upperBPerAPrice.pow(-1);
    correctUpperBPerAPrice = lowerBPerAPrice.pow(-1);
  }

  return {
    isTokenReversed,
    tokenMintA: mintAPub,
    tokenMintB: mintBPub,
    tickSpacing: pool.TICK_SPACING,
    initialAmountBPerA: correctInitialAmountBPerA,
    lowerBPerAPrice: correctLowerBPerAPrice,
    upperBPerAPrice: correctUpperBPerAPrice,
    slippage: new Decimal(pool.SLIPPAGE),
    inputMint: pool.INPUT_MINT,
    inputAmount: new Decimal(pool.INPUT_AMOUNT),
    isOpenPosition: pool.OPEN_POSITION,
  };
}
