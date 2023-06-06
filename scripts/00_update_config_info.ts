import prompt from "prompt";
require("dotenv").config();
import fs from "fs";
import { configEnv } from "./env.config";

const CONFIG_INFO_PATH = "env.config.ts";

const schema = {
  properties: {
    RPC_END_POINT: {
      description: "Enter RPC_END_POINT",
      default: configEnv.RPC_END_POINT,
    },
    REDEX_PROGRAM_ID: {
      description: "Enter REDEX_PROGRAM_ID",
      default: configEnv.REDEX_PROGRAM_ID,
    },
    REDEX_CONFIG_PUB_KEY: {
      description: "Enter REDEX_CONFIG_PUB_KEY",
      default: configEnv.REDEX_CONFIG_PUB_KEY,
    },
    PROTOCOL_FEE_RATE: {
      description: "Enter PROTOCOL_FEE_RATE",
      default: configEnv.PROTOCOL_FEE_RATE,
    },
    FEE_TIERS_TICK_SPACING: {
      description: "Enter FEE_TIERS_TICK_SPACING",
      default: configEnv.FEE_TIERS_TICK_SPACING,
    },
    FEE_TIERS_DEFAULT_FEE_RATE: {
      description: "Enter FEE_TIERS_DEFAULT_FEE_RATE",
      default: configEnv.FEE_TIERS_DEFAULT_FEE_RATE,
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
  export const configEnv = {
    RPC_END_POINT: "${result.RPC_END_POINT}",
    REDEX_PROGRAM_ID: "${result.REDEX_PROGRAM_ID}",
    REDEX_CONFIG_PUB_KEY: "${result.REDEX_CONFIG_PUB_KEY}",
    PROTOCOL_FEE_RATE: ${result.PROTOCOL_FEE_RATE},
    FEE_TIERS_TICK_SPACING: ${result.FEE_TIERS_TICK_SPACING},
    FEE_TIERS_DEFAULT_FEE_RATE: ${result.FEE_TIERS_DEFAULT_FEE_RATE},
  };
    `;

  fs.writeFile(CONFIG_INFO_PATH, content, (err) => {
    if (err) {
      console.error("Error writing to env.config.ts:", err);
    } else {
      console.log("Successfully updated env.config.ts\n");
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
