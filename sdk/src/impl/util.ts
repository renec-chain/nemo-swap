import BN from "bn.js";
import { MintInfo, NATIVE_MINT, u64 } from "@solana/spl-token";
import { AccountFetcher, PoolUtil, TokenInfo } from "..";
import {
  WhirlpoolData,
  WhirlpoolRewardInfo,
  WhirlpoolRewardInfoData,
  TokenAccountInfo,
} from "../types/public";
import Decimal from "decimal.js";
import { DecimalUtil } from "@orca-so/common-sdk";

export async function getTokenMintInfos(
  fetcher: AccountFetcher,
  data: WhirlpoolData,
  refresh: boolean
): Promise<TokenInfo[]> {
  const mintA = data.tokenMintA;
  const infoA = mintA.equals(NATIVE_MINT)
    ? await getNativeMintInfo()
    : await fetcher.getMintInfo(mintA, refresh);
  if (!infoA) {
    throw new Error(`Unable to fetch MintInfo for mint - ${mintA}`);
  }
  const mintB = data.tokenMintB;
  const infoB = mintB.equals(NATIVE_MINT)
    ? await getNativeMintInfo()
    : await fetcher.getMintInfo(mintB, refresh);
  if (!infoB) {
    throw new Error(`Unable to fetch MintInfo for mint - ${mintB}`);
  }
  return [
    { mint: mintA, ...infoA },
    { mint: mintB, ...infoB },
  ];
}

export async function getNativeMintInfo() {
  const nativeMint: TokenInfo = {
    mintAuthority: null,
    supply: new BN(0),
    decimals: 9,
    isInitialized: true,
    freezeAuthority: null,
    mint: NATIVE_MINT,
  };
  return nativeMint;
}

export async function getRewardInfos(
  fetcher: AccountFetcher,
  data: WhirlpoolData,
  refresh: boolean
): Promise<WhirlpoolRewardInfo[]> {
  const rewardInfos: WhirlpoolRewardInfo[] = [];
  for (const rewardInfo of data.rewardInfos) {
    rewardInfos.push(await getRewardInfo(fetcher, rewardInfo, refresh));
  }
  return rewardInfos;
}

async function getRewardInfo(
  fetcher: AccountFetcher,
  data: WhirlpoolRewardInfoData,
  refresh: boolean
): Promise<WhirlpoolRewardInfo> {
  const rewardInfo = { ...data, initialized: false, vaultAmount: new BN(0) };
  if (PoolUtil.isRewardInitialized(data)) {
    const vaultInfo = await fetcher.getTokenInfo(data.vault, refresh);
    if (!vaultInfo) {
      throw new Error(`Unable to fetch TokenAccountInfo for vault - ${data.vault}`);
    }
    rewardInfo.initialized = true;
    rewardInfo.vaultAmount = vaultInfo.amount;
  }
  return rewardInfo;
}

export async function getTokenVaultAccountInfos(
  fetcher: AccountFetcher,
  data: WhirlpoolData,
  refresh: boolean
): Promise<TokenAccountInfo[]> {
  const vaultA = data.tokenVaultA;
  const vaultInfoA = await fetcher.getTokenInfo(vaultA, refresh);
  if (!vaultInfoA) {
    throw new Error(`Unable to fetch TokenAccountInfo for vault - ${vaultA}`);
  }
  const vaultB = data.tokenVaultB;
  const vaultInfoB = await fetcher.getTokenInfo(vaultB, refresh);
  if (!vaultInfoB) {
    throw new Error(`Unable to fetch TokenAccountInfo for vault - ${vaultB}`);
  }
  return [vaultInfoA, vaultInfoB];
}

export function getRateOverToken(
  token: TokenInfo,
  expo: number,
  rawRate: Decimal // rate = rawRate * 10^dY * 10^expo
): u64 {
  if (expo < 0) {
    throw new Error("expo should be positive");
  }

  return DecimalUtil.toU64(rawRate, expo + token.decimals);
}
