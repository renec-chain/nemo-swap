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
import { createAndSendV0Tx } from "./version";
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { ASSOCIATED_PROGRAM_ID } from "@project-serum/anchor/dist/cjs/utils/token";

const GASLESS_PROGRAM_ID = new PublicKey(
  "GasP6kcNpTdXA1M7ENyh5kCEvtHPgy71Habxe62gqHqH"
);
const GASLESS_FEE_PAYER = new PublicKey(
  "GdBRoVNiLbLmYvoSYtN99kobQnJTTYd5KgYGxGKKAZvE"
);

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
      // fix data in case of creating token account
      ctx.program.programId,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_PROGRAM_ID,
      NATIVE_MINT,
      poolData.tokenMintA,
      poolData.tokenMintB,

      // fix data for swap tx
      whirlpoolAddr,
      poolData.tokenVaultA,
      poolData.tokenVaultB,
      oraclePda.publicKey,

      // fix data for gasless
      GASLESS_PROGRAM_ID,
      GASLESS_FEE_PAYER,
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
