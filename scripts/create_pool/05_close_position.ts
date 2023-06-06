import { PublicKey, Keypair } from "@solana/web3.js";
import { PDAUtil, PoolUtil, buildWhirlpoolClient } from "@renec/redex-sdk";
import { Percentage } from "@orca-so/common-sdk";
import { loadProvider, getTokenMintInfo, loadWallets } from "./utils";
import Decimal from "decimal.js";
import config from "./config.json";
import deployed from "./deployed.json";

async function main() {
  const wallets = loadWallets();

  if (!wallets.userKeypair) {
    throw new Error("Please provide user wallet");
  }

  const { ctx } = loadProvider(wallets.userKeypair);

  if (deployed.REDEX_CONFIG_PUB === "") {
    console.log(
      "ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` ."
    );
    return;
  }
  const REDEX_CONFIG_PUB = new PublicKey(deployed.REDEX_CONFIG_PUB);
  const client = buildWhirlpoolClient(ctx);
  const positions = await client.getAllPositionsOf(ctx.wallet.publicKey);

  for (let i = 0; i < config.POOLS.length; i++) {
    const pool = config.POOLS[i];

    const correctTokenOrder = PoolUtil.orderMints(
      pool.TOKEN_MINT_A,
      pool.TOKEN_MINT_B
    );

    const mintAPub = new PublicKey(correctTokenOrder[0]);
    const mintBPub = new PublicKey(correctTokenOrder[1]);
    const tokenMintA = await getTokenMintInfo(ctx, mintAPub);
    const tokenMintB = await getTokenMintInfo(ctx, mintBPub);

    if (tokenMintA && tokenMintB) {
      const whirlpoolPda = PDAUtil.getWhirlpool(
        ctx.program.programId,
        REDEX_CONFIG_PUB,
        mintAPub,
        mintBPub,
        pool.TICK_SPACING
      );
      const whirlpool = await client.getPool(whirlpoolPda.publicKey);
      const tx = await whirlpool.closePosition(
        positions[0].getAddress(),
        Percentage.fromDecimal(new Decimal(10))
      );

      const txid = await tx[0].buildAndExecute();
      console.log(
        "Close a position: " +
          positions[0].getAddress().toString() +
          "at txid:",
        txid
      );
    }
  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
