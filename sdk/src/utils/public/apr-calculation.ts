export type RewardToken = {
  emissionPerWeek: number;
  tokenPrice: number;
};

export type PoolAPRReward = {
  apr: number;
  rewards: { [k: string]: number } | null;
};

/**
 *
 * @param emissionPerWeek : reward for weekly emission
 * @param tokenPrice : price of token in USDT
 * @param tvl : Liquidity is TVL
 * @returns : Reward APR for token
 */
function calculateTokenRewardAPR(emissionPerWeek: number, tokenPrice: number, tvl: number): number {
  return (emissionPerWeek * tokenPrice * (365 / 7)) / tvl;
}

/**
 *
 * @param vol24H : volumn 24h of pool
 * @param feeRate :
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
  // compute fee APR
  const feeAPR = (vol24H * feeRate * 365) / tvl;

  // compute reward for each token
  if (!rewards) {
    return {
      apr: toPercent ? feeAPR * 100 : feeAPR,
      rewards: null,
    };
  }
  const rewardEachToken: { [k: string]: number } = {};
  let totalReward = 0;
  // compute reward for each token
  Object.entries(rewards).forEach(([key, value]) => {
    const rewardApr = calculateTokenRewardAPR(value.emissionPerWeek, value.tokenPrice, tvl);
    totalReward += rewardApr;
    rewardEachToken[key] = toPercent ? rewardApr * 100 : rewardApr;
  });

  const totalAPR = feeAPR + totalReward;

  return {
    apr: toPercent ? totalAPR * 100 : totalAPR,
    rewards: rewardEachToken,
  };
}
