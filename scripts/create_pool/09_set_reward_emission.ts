import { PublicKey, Keypair } from "@solana/web3.js";
import {
  buildWhirlpoolClient,
  WhirlpoolIx,
  toTx,
  WhirlpoolContext,
  InitializeRewardParams,
} from "@renec/redex-sdk";
import { Whirlpool } from "@renec/redex-sdk/src";
import { loadProvider, loadWallets, ROLES } from "./utils";

//usage: yarn set_pool_reward <pool_address> <reward_token_mint> <emission_per_second><reward_index?>
async function main() {
  // Load env variables
  const poolAddressStr = process.argv[2];
  if (!poolAddressStr) {
    throw new Error("Please provide a pool address as the first argument");
  }
  const poolAddress = new PublicKey(poolAddressStr);

  const rewardTokenMintStr = process.argv[3];
  if (!rewardTokenMintStr) {
    throw new Error(
      "Please provide a reward token mint as the second argument"
    );
  }
  const rewardTokenMint = new PublicKey(rewardTokenMintStr);

  const rewardIndexStr = process.argv[4];
  let rewardIndex = 0; // Default value
  if (rewardIndexStr) {
    rewardIndex = parseInt(rewardIndexStr);
    if (isNaN(rewardIndex)) {
      throw new Error("Invalid reward index provided");
    }
  }

  // Load context
  const wallets = loadWallets([ROLES.REWARD_EMISSIONS_SUPPER_AUTH]);
  const rewardAuth = wallets[ROLES.REWARD_EMISSIONS_SUPPER_AUTH];
  const { ctx } = loadProvider(rewardAuth);

  // get reward info
  const client = buildWhirlpoolClient(ctx);

  let whirlpool: Whirlpool;
  try {
    whirlpool = await client.getPool(poolAddress);

    // assert if vault is initialized
    const rewardInfo = whirlpool.getData().rewardInfos[rewardIndex];

    if (!rewardInfo.mint.equals(new PublicKey(0))) {
      if (!rewardInfo.mint.equals(rewardTokenMint)) {
        throw new Error(
          `Reward token mint at reward index ${rewardIndex} is ${rewardInfo.mint.toString()}, not ${rewardTokenMint}`
        );
      }

      showRewardVaultBalance(ctx, rewardTokenMint, rewardInfo.vault);
      return;
    }
  } catch (e) {
    throw new Error(e);
  }

  // initialize the reward info
  console.log(`Initializing reward info at index ${rewardIndex}...`);

  const rewardVaultKeypair = Keypair.generate();
  const params = {
    rewardAuthority: rewardAuth.publicKey,
    funder: rewardAuth?.publicKey || ctx.wallet.publicKey,
    whirlpool: poolAddress,
    rewardMint: rewardTokenMint,
    rewardVaultKeypair,
    rewardIndex,
  } as InitializeRewardParams;

  const tx = toTx(
    ctx,
    WhirlpoolIx.initializeRewardIx(ctx.program, params)
  ).addSigner(rewardAuth);

  const txHash = await tx.buildAndExecute();
  console.log("=====================================");
  console.log("Tx hash: ", txHash);
  showRewardVaultBalance(ctx, rewardTokenMint, rewardVaultKeypair.publicKey);
}

async function showRewardVaultBalance(
  ctx: WhirlpoolContext,
  rewardMint: PublicKey,
  rewardVaultAddress: PublicKey
) {
  const vaultBalance = await ctx.connection.getTokenAccountBalance(
    rewardVaultAddress
  );

  console.log("--------------------");
  console.log("REWARD MINT: ", rewardMint.toString());
  console.log("REWARD VAULT: ", rewardVaultAddress.toString());
  console.log(`TOKEN BALANCE: ${vaultBalance.value.uiAmount}`);
  console.log("--------------------");
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
