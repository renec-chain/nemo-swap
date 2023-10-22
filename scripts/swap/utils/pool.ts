import { PoolInfo } from "../../create_pool/utils/types";
import { PublicKey } from "@solana/web3.js";
import { getConfig, getTokenMintInfo } from "../../create_pool/utils";
import {
  PDAUtil,
  Whirlpool,
  WhirlpoolClient,
  WhirlpoolContext,
} from "@renec/redex-sdk";
const deployed = require("../../create_pool/deployed.json");

export const getWhirlPool = async (
  client: WhirlpoolClient,
  poolInfo: PoolInfo
): Promise<Whirlpool> => {
  const configInfo = await getConfig();
  const mintAPub = new PublicKey(poolInfo.tokenMintA);
  const mintBPub = new PublicKey(poolInfo.tokenMintB);
  const tokenMintA = await getTokenMintInfo(client.getContext(), mintAPub);
  const tokenMintB = await getTokenMintInfo(client.getContext(), mintBPub);

  if (!tokenMintA || !tokenMintB) {
    throw new Error("Token mint info not found");
  }

  if (!deployed && !deployed.REDEX_CONFIG_PUB) {
    throw new Error(
      "ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` ."
    );
  }

  const whirlpoolPDA = await PDAUtil.getWhirlpool(
    client.getContext().program.programId,
    new PublicKey(deployed.REDEX_CONFIG_PUB),
    mintAPub,
    mintBPub,
    poolInfo.tickSpacing
  );

  return await client.getPool(whirlpoolPDA.publicKey);
};
