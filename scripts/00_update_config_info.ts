import prompt from "prompt";
require("dotenv").config();
import fs from "fs";
import { configEnv } from "./env.config";
import { saveConfigInfo, showConfigInfo } from "./create_pool/utils/pool";

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
    REDEX_CONFIG_PUB: {
      description: "Enter REDEX_CONFIG_PUB_KEY",
      default: configEnv.REDEX_CONFIG_PUB,
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

  saveConfigInfo(result as typeof configEnv);

  showConfigInfo();
});
