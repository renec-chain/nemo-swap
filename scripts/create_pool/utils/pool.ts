import readline from "readline";
import Decimal from "decimal.js";
import { PoolUtil } from "@renec/redex-sdk";
import { PoolInfo } from "./types";
import { getConfig } from ".";
const config = getConfig();

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

  if (isTokenReversed) {
    console.log(
      `\n---> WARNING:  Token order of POOL ${poolIndex} is in reversed. Please adjust the config info.\n`
    );
    process.exit(1);
  }

  // Get default pool info
  let initialAmountBPerA = new Decimal(pool.INIT_AMOUNT_B_PER_A);
  let lowerBPerAPrice = new Decimal(pool.LOWER_B_PER_A_PRICE);
  let upperBPerAPrice = new Decimal(pool.UPPER_B_PER_A_PRICE);

  let correctInitialAmountBPerA = initialAmountBPerA;
  let correctLowerBPerAPrice = lowerBPerAPrice;
  let correctUpperBPerAPrice = upperBPerAPrice;

  const result: PoolInfo = {
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

  // Check if optional fields are present and if so, add them to the result
  if (pool["DISCOUNT_TOKEN_MINT"]) {
    result.discountTokenMint = pool["DISCOUNT_TOKEN_MINT"];
  }
  if (pool["TOKEN_CONVERSION_RATE"]) {
    result.tokenConversionRate = parseFloat(pool["TOKEN_CONVERSION_RATE"]);
  }
  if (pool["DISCOUNT_RATE_OVER_TOKEN_CONVERTED_AMOUNT"]) {
    result.discountFeeRateOverTokenConvertedAmount = parseFloat(
      pool["DISCOUNT_RATE_OVER_TOKEN_CONVERTED_AMOUNT"]
    );
  }
  if (pool["DISCOUNT_TOKEN_RATE_OVER_TOKEN_A"]) {
    result.discountTokenRateOverTokenA = new Decimal(
      pool["DISCOUNT_TOKEN_RATE_OVER_TOKEN_A"]
    );
  }
  if (pool["EXPO"]) {
    result.discountTokenRateOverTokenAExpo = parseInt(pool["EXPO"]);
  }

  return result;
}
