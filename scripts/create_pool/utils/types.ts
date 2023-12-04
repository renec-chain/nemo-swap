import { Address } from "@project-serum/anchor";
import Decimal from "decimal.js";

export type PoolInfo = {
  tokenMintA: Address;
  tokenMintB: Address;
  tickSpacing: number;
  initialAmountBPerA: Decimal;
  lowerBPerAPrice: Decimal;
  upperBPerAPrice: Decimal;
  slippage: Decimal;
  inputMint: Address;
  inputAmount: Decimal;
  isOpenPosition: boolean;
};
