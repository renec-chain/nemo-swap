import prompt from "prompt";
require("dotenv").config();
import fs from "fs";
import { poolEnv } from "./env.pool";

const POOL_INFO_PATH = "env.pool.ts";

const schema = {
  properties: {
    TOKEN_MINT_A: {
      description: "Enter TOKEN_MINT_A",
      default: poolEnv.TOKEN_MINT_A,
    },
    TOKEN_MINT_B: {
      description: "Enter TOKEN_MINT_B",
      default: poolEnv.TOKEN_MINT_B,
    },
    TICK_SPACING: {
      description: "Enter TICK_SPACING",
      default: poolEnv.TICK_SPACING || 32,
    },
    INIT_AMOUNT_B_PER_A: {
      description: "Enter INIT_AMOUNT_B_PER_A",
      default: poolEnv.INIT_AMOUNT_B_PER_A,
    },
    LOWER_B_PER_A_PRICE: {
      description: "Enter LOWER_B_PER_A_PRICE",
      default: poolEnv.LOWER_B_PER_A_PRICE,
    },
    UPPER_B_PER_A_PRICE: {
      description: "Enter UPPER_B_PER_A_PRICE",
      default: poolEnv.UPPER_B_PER_A_PRICE,
    },
    SLIPPAGE: {
      description: "Enter SLIPPAGE",
      default: poolEnv.SLIPPAGE,
    },
    INPUT_MINT: {
      description: "Enter INPUT_MINT",
      default: poolEnv.INPUT_MINT,
    },
    INPUT_AMOUNT: {
      description: "Enter INPUT_AMOUNT",
      default: poolEnv.INPUT_AMOUNT,
    },
  },
};

prompt.start();

prompt.get(schema, function (err, result) {
  if (err) {
    console.log(err);
    return;
  }

  const content = `
  export const poolEnv = {
    TOKEN_MINT_A: "${result.TOKEN_MINT_A}",
    TOKEN_MINT_B: "${result.TOKEN_MINT_B}",
    TICK_SPACING: ${result.TICK_SPACING},
    INIT_AMOUNT_B_PER_A: "${result.INIT_AMOUNT_B_PER_A}",
    LOWER_B_PER_A_PRICE: "${result.LOWER_B_PER_A_PRICE}",
    UPPER_B_PER_A_PRICE: "${result.UPPER_B_PER_A_PRICE}",
    SLIPPAGE: "${result.SLIPPAGE}",
    INPUT_MINT: "${result.INPUT_MINT}",
    INPUT_AMOUNT: "${result.INPUT_AMOUNT}",
  };
    `;

  fs.writeFile(POOL_INFO_PATH, content, (err) => {
    if (err) {
      console.error("Error writing to .env.pool.ts:", err);
    } else {
      console.log("Successfully updated .env.pool.ts \n");
    }
  });

  fs.readFile(POOL_INFO_PATH, "utf8", function (err, data) {
    if (err) {
      console.log(`\n\n **_** Error reading ${POOL_INFO_PATH}:`, err);
    } else {
      console.log("=======================================================");
      console.log(data);
      console.log("=======================================================");
    }
  });
});
