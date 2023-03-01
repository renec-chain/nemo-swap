import { buildWhirlpoolClient, PositionImpl } from "@renec/redex-sdk";
import { loadProvider } from "./utils";

async function main() {
  const { ctx } = await loadProvider();
  const client = buildWhirlpoolClient(ctx);
  const positions = await client.getAllPositionsOf(ctx.wallet.publicKey, true);

  // this is a list of positions
  if (positions.length > 0) {
    const firstPosition = positions[0] as PositionImpl;
    const collectFeesTx = await firstPosition.collectFees();
    const txid = await collectFeesTx.buildAndExecute();
    console.log("collectFeesTx", txid);
  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
