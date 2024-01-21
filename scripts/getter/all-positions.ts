import {
  PublicKey,
  Keypair,
  Connection,
  GetProgramAccountsFilter,
} from "@solana/web3.js";
import { PDAUtil, buildWhirlpoolClient, PoolUtil } from "@renec/redex-sdk";
import { loadProvider, TickSpacing } from "../create_pool/utils";
import deployed from "../create_pool/deployed.json";
import { ParsablePosition } from "@renec/redex-sdk";
/**
 * @dev returns all positions of a program id / returns all positions of a pool if poolPubkey is provided
 * @param connection
 * @param programId
 * @param poolPubkey
 * @returns
 */
const getPositions = async (
  connection: Connection,
  programId: PublicKey,
  poolPubkey?: PublicKey
) => {
  const POSITION_SIZE = 216;

  const filters: GetProgramAccountsFilter[] = [
    {
      dataSize: POSITION_SIZE,
    },
  ];

  if (poolPubkey) {
    const config = {
      memcmp: {
        offset: 8,
        bytes: poolPubkey.toString(),
      },
    };
    filters.push(config);
  }

  const data = await connection.getProgramAccounts(programId, { filters });

  const allPositions = [];
  for (const account of data) {
    const position = ParsablePosition.parse(account.account.data);
    allPositions.push(position);
  }

  return allPositions;
};

// usage: Get all positions of pool
// ts-node getter/all-positions.ts
async function main() {
  const dummyWallet = Keypair.generate();

  const { ctx } = loadProvider(dummyWallet);

  // Get all positions of the program
  const positions = await getPositions(ctx.connection, ctx.program.programId);
  console.log("num of all positions: ", positions.length);

  // Get all positions of pool renec/usdt
  const renecReusd = new PublicKey(
    "BQ2sH6LqkhnNZofKXtApHz12frTv1wfbihMg6osMnHx8"
  );
  const renecReusdPositions = await getPositions(
    ctx.connection,
    ctx.program.programId,
    renecReusd
  );

  console.log(
    `num of positions for renec pool: ${renecReusd.toBase58()}: `,
    renecReusdPositions.length
  );
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
