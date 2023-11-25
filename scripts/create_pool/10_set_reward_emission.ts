import { PublicKey, Keypair } from "@solana/web3.js";
import {
  buildWhirlpoolClient,
  WhirlpoolIx,
  toTx,
  WhirlpoolContext,
} from "@renec/redex-sdk";
import { Whirlpool } from "@renec/redex-sdk/src";
import { loadProvider, loadWallets } from "./utils";
import { BN } from "@project-serum/anchor";
import Decimal from "decimal.js";
import { DecimalUtil } from "@orca-so/common-sdk";
import { MintInfo } from "@solana/spl-token";

const DAY_IN_SECONDS = 60 * 60 * 24;

//usage: yarn set_pool_reward <pool_address> <reward_token_mint> <emission_per_day> <reward_index?>
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

  const emissionPerDayStr = process.argv[4];
  if (!emissionPerDayStr) {
    throw new Error(
      "Please provide a reward token mint as the second argument"
    );
  }
  const emissionPerDayDecimal = new Decimal(emissionPerDayStr);

  const rewardIndexStr = process.argv[5];
  let rewardIndex = 0; // Default value
  if (rewardIndexStr) {
    rewardIndex = parseInt(rewardIndexStr);
  }

  // Load context
  const wallets = loadWallets();
  const rewardAuth = wallets.rewardEmissionSupperAuthKeypair;
  const { ctx } = loadProvider(rewardAuth);

  // get reward info
  const rewardTokenInfo = await ctx.fetcher.getMintInfo(rewardTokenMint, true);
  const emissionPerDay = DecimalUtil.toU64(
    emissionPerDayDecimal,
    rewardTokenInfo.decimals
  );

  const client = buildWhirlpoolClient(ctx);
  let whirlpool: Whirlpool;
  try {
    whirlpool = await client.getPool(poolAddress);

    // assert if vault is initialized
    const rewardInfo = whirlpool.getData().rewardInfos[rewardIndex];
    if (rewardInfo.mint.equals(new PublicKey(0))) {
      throw new Error(
        `Reward info at at reward index ${rewardIndex} is not set. Please run scripts 08_initialize_pool_reward.ts first.`
      );
    }
  } catch (e) {
    throw new Error(e);
  }

  // assert vault balance
  await assertVaultBalance(
    ctx,
    rewardTokenInfo,
    whirlpool.getData().rewardInfos[rewardIndex].vault,
    emissionPerDayDecimal
  );

  // set reward emission
  console.log(`Setting reward emission at index ${rewardIndex}...`);
  const tx = toTx(
    ctx,
    WhirlpoolIx.setRewardEmissionsIx(ctx.program, {
      rewardAuthority: rewardAuth.publicKey,
      whirlpool: poolAddress,
      rewardIndex,
      rewardVaultKey: whirlpool.getData().rewardInfos[rewardIndex].vault,
      emissionsPerSecondX64: emissionPerDay.shln(64).divn(DAY_IN_SECONDS),
    })
  ).addSigner(rewardAuth);

  const txHash = await tx.buildAndExecute();
  console.log("=====================================");
  console.log("Transaction hash:", txHash);
}

async function assertVaultBalance(
  ctx: WhirlpoolContext,
  mintInfo: MintInfo,
  rewardVaultAddress: PublicKey,
  emissionPerDayDecimal: Decimal
) {
  const vaultBalance = await ctx.connection.getTokenAccountBalance(
    rewardVaultAddress
  );

  console.log("--------------------");
  console.log("REWARD VAULT: ", rewardVaultAddress.toString());
  console.log(`VAULT TOKEN BALANCE: ${vaultBalance.value.uiAmount}`);
  console.log(`EMISSION PER DAY: ${emissionPerDayDecimal}`);
  console.log("--------------------");

  const emissionPerDay = DecimalUtil.toU64(
    emissionPerDayDecimal,
    mintInfo.decimals
  );

  if (new BN(vaultBalance.value.amount).lt(emissionPerDay)) {
    const amountToTransfer = emissionPerDay.sub(
      new BN(vaultBalance.value.amount)
    );

    const amomuntToTransferDecimal = DecimalUtil.fromU64(
      amountToTransfer,
      mintInfo.decimals
    );

    throw new Error(
      `Expected Vault balance is less than the reward emission per day. Please tranfer at least an amount of ${amomuntToTransferDecimal}.`
    );
  }
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
