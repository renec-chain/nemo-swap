import { PublicKey, Keypair } from "@solana/web3.js";
import {
  PDAUtil,
  buildWhirlpoolClient,
  PriceMath,
  increaseLiquidityQuoteByInputTokenWithParams,
} from "@renec/redex-sdk";
import { DecimalUtil, Percentage } from "@orca-so/common-sdk";
import { loadProvider, delay, getTokenMintInfo, loadWallets } from "./utils";
import Decimal from "decimal.js";
import config from "./config.json";
import deployed from "./deployed.json";

const IS_ENABLE = false;

async function main() {
  const wallets = loadWallets();

  // Check required roles
  if (!wallets.poolCreatorAuthKeypair) {
    throw new Error("Please provide poolCreatorAuthKeypair");
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

  const pool = config.POOLS[0];
  const mintAPub = new PublicKey(pool.TOKEN_MINT_A);
  const mintBPub = new PublicKey(pool.TOKEN_MINT_B);

  const tickSpacing = [8, 64];
  for (let i = 0; i < tickSpacing.length; i++) {
    let whirlpoolPda = PDAUtil.getWhirlpool(
      ctx.program.programId,
      REDEX_CONFIG_PUB,
      mintAPub,
      mintBPub,
      tickSpacing[i]
    );

    await ctx.program.rpc.setEnableFlag(IS_ENABLE, {
      accounts: {
        whirlpoolsConfig: REDEX_CONFIG_PUB,
        whirlpool: whirlpoolPda.publicKey,
        poolCreatorAuthority: wallets.poolCreatorAuthKeypair.publicKey,
      },
    });

    let whirlpool = await client.getPool(whirlpoolPda.publicKey);
    console.log(whirlpool);
  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
