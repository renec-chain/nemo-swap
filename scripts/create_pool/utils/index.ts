import { PublicKey, Connection, Keypair, Commitment } from "@solana/web3.js";
import { AnchorProvider, Wallet, BN } from "@project-serum/anchor";
import { WhirlpoolContext, TokenInfo } from "@renec/redex-sdk";
import { NATIVE_MINT, u64 } from "@solana/spl-token";
require("dotenv").config();

export const ZERO_BN = new BN(0);
export const ONE_SOL = 1000000000;

export const loadProvider = function (payerKeypair: Keypair) {
  const wallets = loadWallets();
  const commitment: Commitment = "confirmed";

  const connection = new Connection(config.RPC_ENDPOINT_URL, { commitment });
  const wallet = new Wallet(payerKeypair);
  const provider = new AnchorProvider(connection, wallet, {});
  const ctx = WhirlpoolContext.withProvider(
    provider,
    new PublicKey(config.REDEX_PROGRAM_ID)
  );

  console.log("endpoint:", ctx.connection.rpcEndpoint);
  console.log("program id: ", config.REDEX_PROGRAM_ID);
  return {
    provider,
    ctx,
    wallets,
  };
};

export const ROLES = {
  DEPLOYER: "deployer_wallet",
  COLLECT_PROTOCOL_FEES_AUTH: "collect_protocol_fees_authority_wallet",
  FEE_AUTH: "fee_authority_wallet",
  REWARD_EMISSIONS_SUPPER_AUTH: "reward_emissions_supper_authority_wallet",
  POOL_CREATOR_AUTH: "pool_creator_authority_wallet",
  USER: "user_wallet",
  TEST: "test_wallet",
};

type RoleType = (typeof ROLES)[keyof typeof ROLES];
export type Account = { [key in RoleType]?: Keypair };

export const loadWallets = (requiredRoles: RoleType[]): Account => {
  return requiredRoles.reduce<Account>((acc, role) => {
    try {
      const walletData = require(`../../.wallets/${role}.json`);
      acc[role] = Keypair.fromSecretKey(Uint8Array.from(walletData));
    } catch (error) {
      throw new Error(
        `Failed to load the wallet for role: ${role}. Reason: ${error.message}`
      );
    }
    return acc;
  }, {} as Account);
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

export const getConfig = () => {
  if (process.env.TESTNET === "1") {
    return require("../config-testnet.json");
  } else {
    return require("../config.json");
  }
};
