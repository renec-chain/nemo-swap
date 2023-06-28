import { calculatePoolAPR, calculatePositionAPR, RewardToken } from "../../src";
import * as assert from "assert";

describe("Calculate Pool APR", () => {
  const reward: { [k: string]: RewardToken } = {
    orca: { emissionPerWeek: 1999.4688, tokenPrice: 0.827557 },
    wldo: { emissionPerWeek: 1874.9949, tokenPrice: 1.371298 },
  };
  const oneReward: { [k: string]: RewardToken } = {
    orca: { emissionPerWeek: 1999.4688, tokenPrice: 0.827557 },
  };
  const vol24H = 1751637;
  const feeRate = 0.0001;
  const tvl = 3952908;
  const poolAPRinPercent = 7.191735900351831;
  const poolAPRnotInPercent = 0.07191735900351831;
  const orcaRewardinPercent = 2.1826830006393267;
  const orcaRewardnotInPercent = 0.021826830006393267;
  const wLDORewardinPercent = 3.391642362963357;
  const wLDORewardnotInPercent = 0.03391642362963357;
  const poolAPRWithoutRewardinPercent = 1.6174105367491476;
  const poolAPRWithoutRewardnotInPercent = 0.016174105367491476;
  const poolAPRoneRewardinPercent = 3.800093537388474;
  const poolAPRoneRewardnotInPercent = 0.03800093537388474;
  const orcaOneRewardinPercent = 2.1826830006393267;
  const orcaOneRewardnotInPercent = 0.021826830006393267;

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

  it("Success calcualate APR reward object empty with toPercent=true", () => {
    const res = calculatePoolAPR(vol24H, feeRate, tvl, {});
    assert.equal(res.apr, poolAPRWithoutRewardinPercent);
    assert.equal(res.rewards, null);
  });

  it("Success calcualate APR reward object empty with toPercent=false", () => {
    const res = calculatePoolAPR(vol24H, feeRate, tvl, {}, false);
    assert.equal(res.apr, poolAPRWithoutRewardnotInPercent);
    assert.equal(res.rewards, null);
  });

  it("Success calcualate APR with one reward with toPercent=true", () => {
    const res = calculatePoolAPR(vol24H, feeRate, tvl, oneReward);
    assert.equal(res.apr, poolAPRoneRewardinPercent);
    assert.equal(res.rewards!.orca, orcaOneRewardinPercent);
  });

  it("Success calcualate APR with one reward with toPercent=false", () => {
    const res = calculatePoolAPR(vol24H, feeRate, tvl, oneReward, false);
    assert.equal(res.apr, poolAPRoneRewardnotInPercent);
    assert.equal(res.rewards!.orca, orcaOneRewardnotInPercent);
  });
});

describe("Calculate Position APR", () => {
  const reward: { [k: string]: RewardToken } = {
    orca: { emissionPerWeek: 1999.4688, tokenPrice: 0.827557 },
    wldo: { emissionPerWeek: 1874.9949, tokenPrice: 1.371298 },
  };
  const vol24H = 2122998;
  const feeRate = 0.0001;
  const lp = 41191049234;
  const lpInRange = 133087045514911758;
  const positionBalance = 0.206918;
  const totalAPRinPercent = 44.550030101540944;
  const totalAPRnotInPercent = 0.44550030101540944;
  const orcaRewardinPercent = 12.905539706540386;
  const orcaRewardnotInPercent = 0.12905539706540386;
  const wldoRewardinPercent = 20.053748149771247;
  const wldoRewardnotInPercent = 0.2005374814977125;
  const positionAPRWithoutRewardinPercent = 11.590742245229308;
  const positionAPRWithoutRewardnotInPercent = 0.11590742245229307;

  it("Success calcualate postion APR with toPercent=true", () => {
    const res = calculatePositionAPR(vol24H, feeRate, lp, lpInRange, positionBalance, reward);
    assert.equal(res.apr, totalAPRinPercent);
    assert.notEqual(res.rewards, null);
    assert.equal(res.rewards!.orca, orcaRewardinPercent);
    assert.equal(res.rewards!.wldo, wldoRewardinPercent);
  });

  it("Success calcualate postion APR with toPercent=false", () => {
    const res = calculatePositionAPR(
      vol24H,
      feeRate,
      lp,
      lpInRange,
      positionBalance,
      reward,
      false
    );
    assert.equal(res.apr, totalAPRnotInPercent);
    assert.notEqual(res.rewards, null);
    assert.equal(res.rewards!.orca, orcaRewardnotInPercent);
    assert.equal(res.rewards!.wldo, wldoRewardnotInPercent);
  });

  it("Success calcualate position APR without reward with toPercent=true", () => {
    const res = calculatePositionAPR(vol24H, feeRate, lp, lpInRange, positionBalance, null);
    assert.equal(res.apr, positionAPRWithoutRewardinPercent);
    assert.equal(res.rewards, null);
  });

  it("Success calcualate position APR without reward with toPercent=false", () => {
    const res = calculatePositionAPR(vol24H, feeRate, lp, lpInRange, positionBalance, null, false);
    assert.equal(res.apr, positionAPRWithoutRewardnotInPercent);
    assert.equal(res.rewards, null);
  });

  it("Success calcualate position APR reward object empty with toPercent=true", () => {
    const res = calculatePositionAPR(vol24H, feeRate, lp, lpInRange, positionBalance, {});
    assert.equal(res.apr, positionAPRWithoutRewardinPercent);
    assert.equal(res.rewards, null);
  });

  it("Success calcualate position APR reward object empty with toPercent=false", () => {
    const res = calculatePositionAPR(vol24H, feeRate, lp, lpInRange, positionBalance, {}, false);
    assert.equal(res.apr, positionAPRWithoutRewardnotInPercent);
    assert.equal(res.rewards, null);
  });
});
