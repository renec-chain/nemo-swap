import { Address } from "@project-serum/anchor";
import { PoolInfo } from "../../create_pool/utils/types";

export type TwoHopTokens = {
  pool1OtherToken: Address;
  pool2OtherToken: Address;
  intermidaryToken: Address;
};

export const getTwoHopSwapTokens = (
  pool1: PoolInfo,
  pool2: PoolInfo
): TwoHopTokens => {
  let intermediaryToken: Address | null = null;
  let pool1OtherToken: Address | null = null;
  let pool2OtherToken: Address | null = null;

  // Check for common tokens between the pools
  const commonTokens: Address[] = [pool1.tokenMintA, pool1.tokenMintB].filter(
    (token) => [pool2.tokenMintA, pool2.tokenMintB].includes(token)
  );

  if (commonTokens.length !== 1) {
    throw new Error(
      "Pools do not have a common intermediary token or have multiple common tokens."
    );
  }

  intermediaryToken = commonTokens[0];

  // Find the other tokens from each pool
  pool1OtherToken =
    pool1.tokenMintA === intermediaryToken
      ? pool1.tokenMintB
      : pool1.tokenMintA;
  pool2OtherToken =
    pool2.tokenMintA === intermediaryToken
      ? pool2.tokenMintB
      : pool2.tokenMintA;

  return {
    pool1OtherToken,
    pool2OtherToken,
    intermidaryToken: intermediaryToken,
  };
};
