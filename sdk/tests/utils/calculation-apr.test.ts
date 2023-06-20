import { calculatePoolAPR, RewardToken } from "../../src";
import * as assert from "assert";

describe("Calculate Pool APR", () => {
  const reward: { [k: string]: RewardToken } = {
    orca: { emissionPerWeek: 1999.4688, tokenPrice: 0.827557 },
    wldo: { emissionPerWeek: 1874.9949, tokenPrice: 1.371298 },
  };
  const vol24H = 1751637;
  const feeRate = 0.0001;
  const tvl = 3952908;
  const poolAPRinPercent = 7.191735900351831;
  const poolAPRnotInPercent = 0.07191735900351831;
  const orcaRewardinPercent = 2.182683000639327;
  const orcaRewardnotInPercent = 0.02182683000639327;
  const wLDORewardinPercent = 3.3916423629633563;
  const wLDORewardnotInPercent = 0.033916423629633563;
  const poolAPRWithoutRewardinPercent = 1.617410536749148;
  const poolAPRWithoutRewardnotInPercent = 0.01617410536749148;
  it("Success calcualate APR with toPercent=true", () => {
    const res = calculatePoolAPR(vol24H, feeRate, tvl, reward);
    assert.equal(res.apr, poolAPRinPercent);
    assert.notEqual(res.rewards, null);
    assert.equal(res.rewards!.orca, orcaRewardinPercent);
    assert.equal(res.rewards!.wldo, wLDORewardinPercent);
  });

  it("Success calcualate APR with toPercent=false", () => {
    const res = calculatePoolAPR(vol24H, feeRate, tvl, reward, false);
    assert.equal(res.apr, poolAPRnotInPercent);
    assert.notEqual(res.rewards, null);
    assert.equal(res.rewards!.orca, orcaRewardnotInPercent);
    assert.equal(res.rewards!.wldo, wLDORewardnotInPercent);
  });

  it("Success calcualate APR without reward with toPercent=true", () => {
    const res = calculatePoolAPR(vol24H, feeRate, tvl, null);
    assert.equal(res.apr, poolAPRWithoutRewardinPercent);
    assert.equal(res.rewards, null);
  });

  it("Success calcualate APR without reward with toPercent=false", () => {
    const res = calculatePoolAPR(vol24H, feeRate, tvl, null, false);
    assert.equal(res.apr, poolAPRWithoutRewardnotInPercent);
    assert.equal(res.rewards, null);
  });
});
