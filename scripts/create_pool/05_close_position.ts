import { buildWhirlpoolClient } from "@renec/redex-sdk";
import { Percentage } from "@orca-so/common-sdk";
import { loadProvider, loadWallets } from "./utils";
import Decimal from "decimal.js";

async function main() {
  const wallets = loadWallets();

  if (!wallets.userKeypair) {
    throw new Error("Please provide user_wallet wallet");
  }

  const { ctx } = loadProvider(wallets.userKeypair);

  const client = buildWhirlpoolClient(ctx);
  const positions = await client.getAllPositionsOf(ctx.wallet.publicKey);

  for (const position of positions) {
    const whirlpool = await client.getPool(
      position.getData().whirlpool.toBase58()
    );
    const [tx] = await whirlpool.closePosition(
      position.getAddress(),
      Percentage.fromDecimal(new Decimal(1))
    );

    const txid = await tx.buildAndExecute();
    console.log(
      `Closed the position: ${position
        .getAddress()
        .toString()} successfully at txid ${txid}`
    );
  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
