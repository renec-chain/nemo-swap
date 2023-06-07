import { PublicKey } from "@solana/web3.js";
import { PDAUtil, buildWhirlpoolClient } from "@renec/redex-sdk";
import { loadProvider, getTokenMintInfo, loadWallets } from "./utils";
import config from "./config.json";
import deployed from "./deployed.json";

const IS_ENABLE = false;

async function main() {
  const wallets = loadWallets();

  // Check required roles
  if (!wallets.poolCreatorAuthKeypair) {
    throw new Error("Please provide pool_creator_authority_wallet wallet");
  }

  const { ctx } = loadProvider(wallets.poolCreatorAuthKeypair);

  if (deployed.REDEX_CONFIG_PUB === "") {
    console.log(
      "ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` ."
    );
    return;
  }
  const REDEX_CONFIG_PUB = new PublicKey(deployed.REDEX_CONFIG_PUB);
  const client = buildWhirlpoolClient(ctx);

  for (let i = 0; i < config.POOLS.length; i++) {
    const pool = config.POOLS[i];
    const mintAPub = new PublicKey(pool.TOKEN_MINT_A);
    const mintBPub = new PublicKey(pool.TOKEN_MINT_B);
    const tokenMintA = await getTokenMintInfo(ctx, mintAPub);
    const tokenMintB = await getTokenMintInfo(ctx, mintBPub);

    if (tokenMintA && tokenMintB) {
      let whirlpoolPda = PDAUtil.getWhirlpool(
        ctx.program.programId,
        REDEX_CONFIG_PUB,
        mintAPub,
        mintBPub,
        pool.TICK_SPACING
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
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
