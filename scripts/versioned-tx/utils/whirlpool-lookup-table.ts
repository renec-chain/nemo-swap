import {
  AddressLookupTableProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  Signer,
} from "@solana/web3.js";
import { PDAUtil, Whirlpool, WhirlpoolContext } from "@renec/redex-sdk";
import { getStartTicksWithOffset } from "../../common/tick-array";
import {
  addAddressesToTable,
  createAndSendV0Tx,
  createLookupTable,
} from "./version";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

export class WhirlpoolLookupTable {
  static numOfSurroundingTickArrays = 6;
  static numOfTicksInTickArray = 88;

  public static async createWhirlpoolLookupTable(
    whirlpool: Whirlpool,
    ctx: WhirlpoolContext,
    keypair: Keypair
  ): Promise<PublicKey> {
    const connection = ctx.connection;

    const [createLookupTableInst, lookupTableAddress] =
      AddressLookupTableProgram.createLookupTable({
        authority: keypair.publicKey,
        payer: keypair.publicKey,
        recentSlot: await connection.getSlot(),
      });

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

    const addAddressesInst = AddressLookupTableProgram.extendLookupTable({
      payer: keypair.publicKey,
      authority: keypair.publicKey,
      lookupTable: lookupTableAddress,
      addresses,
    });

    const hash = await createAndSendV0Tx(connection, keypair, [
      createLookupTableInst,
      addAddressesInst,
    ]);

    console.log("Whirlpool lookuptable created:", hash);

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
