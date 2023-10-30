import { PublicKey, Keypair } from "@solana/web3.js";
import { PDAUtil, buildWhirlpoolClient, PoolUtil } from "@renec/redex-sdk";
import { loadProvider, TickSpacing } from "../create_pool/utils";
import deployed from "../create_pool/deployed.json";

async function main() {
  const tokenA = new PublicKey(process.argv[2]);
  const tokenB = new PublicKey(process.argv[3]);

  const correctTokenOrder = PoolUtil.orderMints(tokenA, tokenB);

  const dummyWallet = Keypair.generate();

  const { ctx } = loadProvider(dummyWallet);
  const client = buildWhirlpoolClient(ctx);

  if (deployed.REDEX_CONFIG_PUB === "") {
    console.log(
      "ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` ."
    );
    return;
  }

  const REDEX_CONFIG_PUB = new PublicKey(deployed.REDEX_CONFIG_PUB);
  const mintAPub = new PublicKey(correctTokenOrder[0]);
  const mintBPub = new PublicKey(correctTokenOrder[1]);

  console.log("===================================================");
  console.log("token_a:", mintAPub.toBase58());
  console.log("token_b:", mintBPub.toBase58());

  const whirlpoolPda = PDAUtil.getWhirlpool(
    ctx.program.programId,
    REDEX_CONFIG_PUB,
    mintAPub,
    mintBPub,
    TickSpacing.ThirtyTwo
  );

  try {
    const whirlpool = await client.getPool(whirlpoolPda.publicKey);
    if (whirlpool) {
      console.log("===================================================");
      console.log("POOL PUBKEY:", whirlpoolPda.publicKey.toBase58());

      return;
    }
  } catch (e) {
    console.log("===================================================");
    console.log("Pool does not exist. ");
  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
