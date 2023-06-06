import prompt from "prompt";
require("dotenv").config();
import fs from "fs";

const POOL_INFO_PATH = "env.pool.ts";
const schema = {
  properties: {
    TOKEN_MINT_A: {
      description: "Enter TOKEN_MINT_A",
      default:
        process.env.TOKEN_MINT_A ||
        "So11111111111111111111111111111111111111112",
    },
    TOKEN_MINT_B: {
      description: "Enter TOKEN_MINT_B",
      default:
        process.env.TOKEN_MINT_B ||
        "4Q89182juiadeFgGw3fupnrwnnDmBhf7e7fHWxnUP3S3",
    },
    TICK_SPACING: {
      description: "Enter TICK_SPACING",
      default: process.env.TICK_SPACING || 32,
    },
    INIT_AMOUNT_B_PER_A: {
      description: "Enter INIT_AMOUNT_B_PER_A",
      default: process.env.INIT_AMOUNT_B_PER_A || "1.0",
    },
    LOWER_B_PER_A_PRICE: {
      description: "Enter LOWER_B_PER_A_PRICE",
      default: process.env.LOWER_B_PER_A_PRICE || "0.0001",
    },
    UPPER_B_PER_A_PRICE: {
      description: "Enter UPPER_B_PER_A_PRICE",
      default: process.env.UPPER_B_PER_A_PRICE || "100",
    },
    SLIPPAGE: {
      description: "Enter SLIPPAGE",
      default: process.env.SLIPPAGE || "1",
    },
    INPUT_MINT: {
      description: "Enter INPUT_MINT",
      default:
        process.env.INPUT_MINT || "So11111111111111111111111111111111111111112",
    },
    INPUT_AMOUNT: {
      description: "Enter INPUT_AMOUNT",
      default: process.env.INPUT_AMOUNT || "0.2",
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
  export const env = {
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
      console.log("Successfully updated .env.pool.ts");
    }
  });

  fs.readFile(POOL_INFO_PATH, "utf8", function (err, data) {
    if (err) {
      console.log("\n\n **_** Error reading env.ts:", err);
    } else {
      console.log("=======================================================");
      console.log(data);
      console.log("=======================================================");
    }
  });
});
