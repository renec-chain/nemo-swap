import { buildWhirlpoolClient, PositionImpl } from "@renec/redex-sdk";
import { Percentage } from "@orca-so/common-sdk";
import Decimal from "decimal.js";
import { loadProvider } from "./utils";

async function main() {
  const { ctx } = await loadProvider();
  const client = buildWhirlpoolClient(ctx);
  const positions = await client.getAllPositionsOf(ctx.wallet.publicKey, true);

  // this is a list of positions
  if (positions.length > 0) {
    const firstPosition = positions[0] as PositionImpl;
    // this is a close position sample
    const slippageTolerance = Percentage.fromDecimal(new Decimal("1")); // 1%
    const tx = await firstPosition.closePosition(slippageTolerance);
    console.log(await tx.buildAndExecute());
  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
