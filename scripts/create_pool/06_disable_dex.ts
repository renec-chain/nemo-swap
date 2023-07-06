import { PublicKey } from "@solana/web3.js";
import { PDAUtil, buildWhirlpoolClient } from "@renec/redex-sdk";
import { loadProvider, getTokenMintInfo, loadWallets } from "./utils";
import { configEnv } from "../env.config";
import { poolEnv } from "../env.pool";

const IS_ENABLE = true;

async function main() {
  const wallets = loadWallets();

  // Check required roles
  if (!wallets.poolCreatorAuthKeypair) {
    throw new Error("Please provide pool_creator_authority_wallet wallet");
  }

  const { ctx } = loadProvider(wallets.poolCreatorAuthKeypair);
  let REDEX_CONFIG_PUB: PublicKey;

  try {
    REDEX_CONFIG_PUB = new PublicKey(configEnv.REDEX_CONFIG_PUB);
  } catch (e) {
    console.log(
      "ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` ."
    );
    return;
  }

  const client = buildWhirlpoolClient(ctx);

  const mintAPub = new PublicKey(poolEnv.TOKEN_MINT_A);
  const mintBPub = new PublicKey(poolEnv.TOKEN_MINT_B);
  const tokenMintA = await getTokenMintInfo(ctx, mintAPub);
  const tokenMintB = await getTokenMintInfo(ctx, mintBPub);

  if (tokenMintA && tokenMintB) {
    let whirlpoolPda = PDAUtil.getWhirlpool(
      ctx.program.programId,
      REDEX_CONFIG_PUB,
      mintAPub,
      mintBPub,
      poolEnv.TICK_SPACING
    );

    await ctx.program.rpc.setEnableFlag(IS_ENABLE, {
      accounts: {
        whirlpoolsConfig: REDEX_CONFIG_PUB,
        whirlpool: whirlpoolPda.publicKey,
        poolCreatorAuthority: wallets.poolCreatorAuthKeypair.publicKey,
      },
    });

    let whirlpool = await client.getPool(whirlpoolPda.publicKey);
    console.log("============================");
    console.log("Pool address: ", whirlpoolPda.publicKey.toString());
    console.log("Is enable: ", whirlpool.getData().isEnabled);
  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
