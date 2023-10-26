import { PublicKey, Keypair } from "@solana/web3.js";
import { PriceMath, buildWhirlpoolClient } from "@renec/redex-sdk";
import { loadProvider } from "../create_pool/utils";

// usage: yarn run get_pool_info <pool_address>
const poolAddress = new PublicKey(process.argv[2]);

async function main() {
  // Create a dummy wallet
  const dummyWallet = Keypair.generate();

  const { ctx } = loadProvider(dummyWallet);
  const client = buildWhirlpoolClient(ctx);
  const whirlpool = await client.getPool(poolAddress);
  const whirlpoolData = whirlpool.getData();

  const tokenMintA = whirlpool.getTokenAInfo();
  const tokenMintB = whirlpool.getTokenBInfo();

  const price = PriceMath.sqrtPriceX64ToPrice(
    whirlpool.getData().sqrtPrice,
    tokenMintA.decimals,
    tokenMintB.decimals
  );
  console.log("===================================================");
  console.log("TOKEN_A:", whirlpoolData.tokenMintA.toString());
  console.log("TOKEN_B:", whirlpoolData.tokenMintB.toString());
  console.log("------------------------------------");
  console.log("PRICE:", price.toFixed(6));
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
