import { Keypair, PublicKey } from "@solana/web3.js";
import { PDAUtil, Whirlpool, WhirlpoolContext } from "@renec/redex-sdk";
import { getStartTicksWithOffset } from "../../common/tick-array";
import { addAddressesToTable, createLookupTable } from "./version";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

export class WhirlpoolLookupTable {
  static numOfSurroundingTickArrays = 6;
  static numOfTicksInTickArray = 88;

  public static async createWhirlpoolLookupTable(
    whirlpool: Whirlpool,
    ctx: WhirlpoolContext,
    keypair: Keypair
  ): Promise<PublicKey> {
    const lookupTableAddress = await createLookupTable(ctx.connection, keypair);

    const poolData = whirlpool.getData();
    const whirlpoolAddr = whirlpool.getAddress();
    const oraclePda = PDAUtil.getOracle(ctx.program.programId, whirlpoolAddr);

    let addresses = [
      ctx.program.programId,
      TOKEN_PROGRAM_ID,
      whirlpoolAddr,
      poolData.tokenVaultA,
      poolData.tokenVaultB,
      oraclePda.publicKey,
    ];

    const rightTickArrayStartTicks = getStartTicksWithOffset(
      poolData.tickCurrentIndex,
      poolData.tickSpacing,
      this.numOfSurroundingTickArrays,
      true
    );

    const leftTickArrayStartTicks = getStartTicksWithOffset(
      poolData.tickCurrentIndex +
        poolData.tickSpacing * this.numOfTicksInTickArray,
      poolData.tickSpacing,
      this.numOfSurroundingTickArrays,
      false
    );

    const allStartTicks = [
      ...leftTickArrayStartTicks,
      ...rightTickArrayStartTicks,
    ];
    const initializedTickArrays = await getTickArrays(
      allStartTicks,
      ctx,
      whirlpoolAddr
    );

    addresses = [
      ...addresses,
      ...initializedTickArrays.map((tickArray) => tickArray.address),
    ];

    try {
      const hash = await addAddressesToTable(
        ctx.connection,
        keypair,
        lookupTableAddress,
        addresses
      );
      console.log("Addresses added to lookup table: ", hash);
    } catch (error) {
      console.error("Error adding addresses to lookup table: ", error);
      // Additional error handling as needed
    }

    return lookupTableAddress;
  }
}

export async function getTickArrays(
  startIndices: number[],
  ctx: WhirlpoolContext,
  whirlpoolKey: PublicKey
) {
  try {
    const tickArrayPdas = startIndices.map((value) =>
      PDAUtil.getTickArray(ctx.program.programId, whirlpoolKey, value)
    );
    const tickArrayAddresses = tickArrayPdas.map((pda) => pda.publicKey);
    const tickArrays = await ctx.fetcher.listTickArrays(
      tickArrayAddresses,
      true
    );
    return tickArrayAddresses.map((addr, index) => ({
      address: addr,
      data: tickArrays[index],
    }));
  } catch (error) {
    console.error("Error retrieving tick arrays: ", error);
    return []; // or appropriate error handling
  }
}
