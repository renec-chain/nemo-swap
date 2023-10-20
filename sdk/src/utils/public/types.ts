import { PublicKey } from "@solana/web3.js";

/**
 * An enum for the direction of a swap.
 * @category Whirlpool Utils
 */
export enum SwapDirection {
  AtoB = "aToB",
  BtoA = "bToA",
}

/**
 * An enum for the token type in a Whirlpool.
 * @category Whirlpool Utils
 */
export enum TokenType {
  TokenA = 1,
  TokenB,
}

export type TwoHopSwapPoolParams = {
  whirlpoolOne: PublicKey;
  whirlpoolTwo: PublicKey;
  tokenOwnerAccountOneA: PublicKey;
  tokenOwnerAccountOneB: PublicKey;
  tokenOwnerAccountTwoA: PublicKey;
  tokenOwnerAccountTwoB: PublicKey;
  tokenVaultOneA: PublicKey;
  tokenVaultOneB: PublicKey;
  tokenVaultTwoA: PublicKey;
  tokenVaultTwoB: PublicKey;
  oracleOne: PublicKey;
  oracleTwo: PublicKey;
};
