import prompt from "prompt";
require("dotenv").config();
import fs from "fs";
import { env } from "./env.config";

const CONFIG_INFO_PATH = "env.config.ts";

const schema = {
  properties: {
    RPC_END_POINT: {
      description: "Enter RPC_END_POINT",
      default:
        env.RPC_END_POINT || "https://api-mainnet-beta.renec.foundation:8899/",
    },
    REDEX_PROGRAM_ID: {
      description: "Enter REDEX_PROGRAM_ID",
      default:
        process.env.REDEX_PROGRAM_ID ||
        "7rh7ZtPzHqdY82RWjHf1Q8NaQiWnyNqkC48vSixcBvad",
    },
    PROTOCOL_FEE_RATE: {
      description: "Enter PROTOCOL_FEE_RATE",
      default: process.env.PROTOCOL_FEE_RATE || 300,
    },
    FEE_TIERS_TICK_SPACING: {
      description: "Enter FEE_TIERS_TICK_SPACING",
      default: process.env.FEE_TIERS_TICK_SPACING || 32,
    },
    FEE_TIERS_DEFAULT_FEE_RATE: {
      description: "Enter FEE_TIERS_DEFAULT_FEE_RATE",
      default: process.env.FEE_TIERS_DEFAULT_FEE_RATE || 100,
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
    RPC_END_POINT: "${result.RPC_END_POINT}",
    REDEX_PROGRAM_ID: "${result.REDEX_PROGRAM_ID}",
    PROTOCOL_FEE_RATE: ${result.PROTOCOL_FEE_RATE},
    FEE_TIERS_TICK_SPACING: ${result.FEE_TIERS_TICK_SPACING},
    FEE_TIERS_DEFAULT_FEE_RATE: ${result.FEE_TIERS_DEFAULT_FEE_RATE},
  };
    `;

  fs.writeFile(CONFIG_INFO_PATH, content, (err) => {
    if (err) {
      console.error("Error writing to env.config.ts:", err);
    } else {
      console.log("\nSuccessfully updated env.config.ts");
    }
  });

  fs.readFile(CONFIG_INFO_PATH, "utf8", function (err, data) {
    if (err) {
      console.log("\n\n **_** Error reading env.ts:", err);
    } else {
      console.log("=======================================================");
      console.log(data);
      console.log("=======================================================");
    }
  });
});
