import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import { AnchorProvider, Wallet, BN } from "@project-serum/anchor";
import { WhirlpoolContext, TokenInfo } from "@renec/redex-sdk";
import { NATIVE_MINT, u64 } from "@solana/spl-token";
import config from "../config.json";

export const ZERO_BN = new BN(0);
export const ONE_SOL = 1000000000;

export type NemoswapAccounts = {
  deployerKeypair?: Keypair;
  collectProtocolFeesAuthKeypair?: Keypair;
  feeAuthKeypair?: Keypair;
  rewardEmissionSupperAuthKeypair?: Keypair;
  poolCreatorAuthKeypair?: Keypair;
  userKeypair?: Keypair;
};

export const loadProvider = function (payerKeypair: Keypair) {
  const wallets = loadWallets();
  const connection = new Connection(config.RPC_ENDPOINT_URL);
  const wallet = new Wallet(payerKeypair);
  const provider = new AnchorProvider(connection, wallet, {});
  const ctx = WhirlpoolContext.withProvider(
    provider,
    new PublicKey(config.REDEX_PROGRAM_ID)
  );
  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("wallet pubkey:", ctx.wallet.publicKey.toBase58());

  return {
    provider,
    ctx,
    wallets,
  };
};

export const loadWallets = function (): NemoswapAccounts {
  let deployerKeypair: Keypair | undefined = undefined;
  let collectProtocolFeesAuthKeypair: Keypair | undefined = undefined;
  let feeAuthKeypair: Keypair | undefined = undefined;
  let rewardEmissionSupperAuthKeypair: Keypair | undefined = undefined;
  let poolCreatorAuthKeypair: Keypair | undefined = undefined;
  let userKeypair: Keypair | undefined = undefined;

  try {
    const deployerWallet = require("../../.wallets/deployer_wallet.json");
    deployerKeypair = Keypair.fromSecretKey(Uint8Array.from(deployerWallet));
  } catch {}

  try {
    const collectProtocolFeesAuthWallet = require("../../.wallets/collect_protocol_fees_authority_wallet.json");
    collectProtocolFeesAuthKeypair = Keypair.fromSecretKey(
      Uint8Array.from(collectProtocolFeesAuthWallet)
    );
  } catch {}

  try {
    const feeAuthWallet = require("../../.wallets/fee_authority_wallet.json");
    feeAuthKeypair = Keypair.fromSecretKey(Uint8Array.from(feeAuthWallet));
  } catch {}

  try {
    const rewardEmissionSupperAuthWallet = require("../../.wallets/reward_emissions_supper_authority_wallet.json");
    rewardEmissionSupperAuthKeypair = Keypair.fromSecretKey(
      Uint8Array.from(rewardEmissionSupperAuthWallet)
    );
  } catch {}

  try {
    const poolCreatorAuthWallet = require("../../.wallets/pool_creator_authority_wallet.json");
    poolCreatorAuthKeypair = Keypair.fromSecretKey(
      Uint8Array.from(poolCreatorAuthWallet)
    );
  } catch {}

  try {
    const userWallet = require("/Users/minhdo/.config/solana/id.json");
    userKeypair = Keypair.fromSecretKey(Uint8Array.from(userWallet));
  } catch {}

  return {
    deployerKeypair,
    collectProtocolFeesAuthKeypair,
    feeAuthKeypair,
    rewardEmissionSupperAuthKeypair,
    poolCreatorAuthKeypair,
    userKeypair,
  };
};

export const getNativeMintInfo = async function () {
  const nativeMint: TokenInfo = {
    mintAuthority: null,
    supply: ZERO_BN,
    decimals: 9,
    isInitialized: true,
    freezeAuthority: null,
    mint: NATIVE_MINT,
  };
  return nativeMint;
};

export const getTokenMintInfo = async function (
  ctx: WhirlpoolContext,
  address: PublicKey
) {
  if (address.equals(NATIVE_MINT)) {
    const nativeMint = await getNativeMintInfo();
    return nativeMint;
  }
  const mint = await ctx.fetcher.getMintInfo(address);
  return mint;
};

export const delay = async function (milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

export const mapTickSpacing = {
  1: "One",
  8: "Stable",
  32: "ThirtyTwo",
  64: "SixtyFour",
  128: "Standard",
};

export enum TickSpacing {
  One = 1,
  Stable = 8,
  ThirtyTwo = 32,
  SixtyFour = 64,
  Standard = 128,
}
