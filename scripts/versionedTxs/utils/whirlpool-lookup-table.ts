import { Keypair, PublicKey } from "@solana/web3.js";
import { PDAUtil, Whirlpool, WhirlpoolContext } from "@renec/redex-sdk";
import { getStartTicksWithOffset } from "../../common/tick-array";
import { addAddressesToTable, createLookupTable } from "./version";

export class WhirlpoolLookupTable {
  public static async createWhirlpoolLookupTable(
    whirlpool: Whirlpool,
    ctx: WhirlpoolContext,
    keypair: Keypair
  ): Promise<PublicKey> {
    const numOfSurroundingTickArrays = 5;
    const lut = await createLookupTable(ctx.connection, keypair);

    const poolData = whirlpool.getData();

    // What can be cached?
    const whirlpoolAddr = whirlpool.getAddress();

    const oraclePda = PDAUtil.getOracle(ctx.program.programId, whirlpoolAddr);
    let addresses = [
      whirlpool.getAddress(),
      poolData.tokenVaultA,
      poolData.tokenVaultB,
      oraclePda.publicKey,
    ];

    // all tick arrays
    const rightTickArrayStartTicks = getStartTicksWithOffset(
      poolData.tickCurrentIndex,
      poolData.tickSpacing,
      numOfSurroundingTickArrays,
      true
    );

    const leftTickArrayStartTicks = getStartTicksWithOffset(
      poolData.tickCurrentIndex + poolData.tickSpacing * 88,
      poolData.tickSpacing,
      numOfSurroundingTickArrays,
      false
    );

    const allStartTicks = leftTickArrayStartTicks.concat(
      rightTickArrayStartTicks
    );

    const initializedTickArrays = await getTickArrays(
      allStartTicks,
      ctx,
      whirlpoolAddr
    );

    addresses = addresses.concat(
      initializedTickArrays.map((tickArray) => tickArray.address)
    );

    addresses.map((address) => console.log("address: ", address.toBase58()));

    // Add addresses to lut
    const hash = await addAddressesToTable(
      ctx.connection,
      keypair,
      lut,
      addresses
    );

    return lut;
  }
}

export async function getTickArrays(
  startIndices: number[],
  ctx: WhirlpoolContext,
  whirlpoolKey: PublicKey
) {
  const tickArrayPdas = await startIndices.map((value) =>
    PDAUtil.getTickArray(ctx.program.programId, whirlpoolKey, value)
  );
  const tickArrayAddresses = tickArrayPdas.map((pda) => pda.publicKey);
  const tickArrays = await ctx.fetcher.listTickArrays(tickArrayAddresses, true);
  return tickArrayAddresses.map((addr, index) => {
    return {
      address: addr,
      data: tickArrays[index],
    };
  });
}
