import Decimal from "decimal.js";

export type RewardToken = {
  emissionPerWeek: number;
  tokenPrice: number;
};

export type PoolAPRReward = {
  apr: number;
  rewards: { [k: string]: number } | null;
};

/**
 * @param emissionPerWeek : reward for weekly emission
 * @param tokenPrice : price of token in USDT
 * @param tvl : Liquidity is TVL
 * @returns : Reward APR for token
 */
function calculateTokenPoolRewardAPR(
  emissionPerWeek: number,
  tokenPrice: number,
  tvl: number
): number {
  // reward = emissionPerWeek x tokenPrice x (365/7) / TVL
  return new Decimal(emissionPerWeek)
    .mul(tokenPrice)
    .mul(new Decimal(365).div(7))
    .div(tvl)
    .toNumber();
}

/**
 *
 * @param vol24H : volumn 24h of pool
 * @param feeRate : fee rate in raw value Eg: 0.001% -> 0.00001
 * @param tvl : Liquidity is TVL
 * @param rewards : rewards tokens APR maybe contain one or more or nothing reward token
 * @param toPercent : APR result in percentage or not
 * @returns  see: PoolAPRReward
 */
export function calculatePoolAPR(
  vol24H: number,
  feeRate: number,
  tvl: number,
  rewards: { [k: string]: RewardToken } | null,
  toPercent: boolean = true
): PoolAPRReward {
  // feeAPR = vol24H x feeRate x 365 / TVL
  const feeAPR = new Decimal(vol24H).mul(feeRate).mul(365).div(tvl).toNumber();

  // compute reward for each token
  if (!rewards || Object.keys(rewards).length === 0) {
    return {
      apr: toPercent ? new Decimal(feeAPR).mul(100).toNumber() : feeAPR,
      rewards: null,
    };
  }
  const rewardEachToken: { [k: string]: number } = {};
  let totalReward = new Decimal(0);
  // compute reward for each token
  Object.entries(rewards).forEach(([key, value]) => {
    const rewardApr = calculateTokenPoolRewardAPR(value.emissionPerWeek, value.tokenPrice, tvl);
    totalReward = totalReward.add(rewardApr);
    rewardEachToken[key] = toPercent ? new Decimal(rewardApr).mul(100).toNumber() : rewardApr;
  });

  // totalAPR = feeAPR + totalReward
  const totalAPR = new Decimal(feeAPR).add(totalReward).toNumber();

  return {
    apr: toPercent ? new Decimal(totalAPR).mul(100).toNumber() : totalAPR,
    rewards: rewardEachToken,
  };
}

export function calculateTokenPositionRewardAPR(
  emissionPerWeek: number,
  tokenPrice: number,
  share: number,
  positionBalance: number
): number {
  // rewardAPR = emissionPerWeek x tokenPrice x (365/7) x share / positionBalance
  return new Decimal(emissionPerWeek)
    .mul(tokenPrice)
    .mul(new Decimal(365).div(7))
    .mul(share)
    .div(positionBalance)
    .toNumber();
}

export function calculatePositionAPR(
  vol24H: number,
  feeRate: number,
  lp: number,
  lpInRange: number,
  positionBalance: number,
  rewards: { [k: string]: RewardToken } | null,
  toPercent: boolean = true
) {
  // share of position's liquidity
  // share = lp / LP
  const share = new Decimal(lp).div(lpInRange).toNumber();

  // feeAPR = vol24H x feeRate x 365 x share / balance
  const feeAPR = new Decimal(vol24H)
    .mul(feeRate)
    .mul(365)
    .mul(share)
    .div(positionBalance)
    .toNumber();

  // compute reward for each token
  if (!rewards || Object.keys(rewards).length === 0) {
    return {
      apr: toPercent ? new Decimal(feeAPR).mul(100).toNumber() : feeAPR,
      rewards: null,
    };
  }

  const rewardEachToken: { [k: string]: number } = {};
  let totalReward = new Decimal(0);
  // compute reward for each token
  Object.entries(rewards).forEach(([key, value]) => {
    const rewardApr = calculateTokenPositionRewardAPR(
      value.emissionPerWeek,
      value.tokenPrice,
      share,
      positionBalance
    );
    totalReward = totalReward.add(rewardApr);
    rewardEachToken[key] = toPercent ? rewardApr * 100 : rewardApr;
  });

  // totalAPR = feeAPR + totalRewardToken
  const totalAPR = new Decimal(feeAPR).add(totalReward).toNumber();

  return {
    apr: toPercent ? new Decimal(totalAPR).mul(100).toNumber() : totalAPR,
    rewards: rewardEachToken,
  };
}
