import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  PDAUtil,
  buildWhirlpoolClient,
  swapQuoteByInputToken,
} from "@renec/redex-sdk";
import {
  loadProvider,
  getTokenMintInfo,
  loadWallets,
} from "../create_pool/utils";
import config from "../create_pool/config.json";
import deployed from "../create_pool/deployed.json";
import { DecimalUtil, Percentage, Instruction } from "@orca-so/common-sdk";
import Decimal from "decimal.js";

const SLIPPAGE = 10;

function compareInstructions(
  instruction1: TransactionInstruction,
  instruction2: TransactionInstruction
) {
  if (instruction1.keys.length !== instruction2.keys.length) return false;

  for (let i = 0; i < instruction1.keys.length; i++) {
    if (instruction1.keys[i].isSigner !== instruction2.keys[i].isSigner)
      return false;
    if (instruction1.keys[i].isWritable !== instruction2.keys[i].isWritable)
      return false;
    if (
      instruction1.keys[i].pubkey.toString() !==
      instruction2.keys[i].pubkey.toString()
    )
      return false;
  }

  if (!instruction1.data.equals(instruction2.data)) return false;

  if (instruction1.programId.toString() !== instruction2.programId.toString())
    return false;

  return true;
}

function construct_swap_2_instruction(
  instruction1: Instruction,
  instruction2: Instruction
): Instruction {
  let new_instruction2: Instruction = {
    instructions: [],
    cleanupInstructions: [],
    signers: [],
  };

  // NOTE: currently, the clean up instructions are being empty, so we ignore it
  // cleanUpInstructions are only appear in decreaseLiquidity, collectFees, collectReward and closePosition txs
  for (let j = 0; j < instruction2.instructions.length; j++) {
    let found = false;

    for (let i = 0; i < instruction1.instructions.length; i++) {
      if (
        compareInstructions(
          instruction1.instructions[i],
          instruction2.instructions[j]
        )
      ) {
        found = true;
        break;
      }
    }

    if (!found) {
      new_instruction2.instructions.push(instruction2.instructions[j]);
    }
  }

  new_instruction2.cleanupInstructions = instruction2.cleanupInstructions;
  new_instruction2.signers = instruction2.signers;

  return new_instruction2;
}

async function main() {
  const wallets = loadWallets();

  // Check required roles
  if (!wallets.userKeypair) {
    throw new Error("Please provide userKeypair wallet");
  }

  const { ctx } = loadProvider(wallets.userKeypair);

  if (deployed.REDEX_CONFIG_PUB === "") {
    console.log(
      "ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` ."
    );
    return;
  }
  const REDEX_CONFIG_PUB = new PublicKey(deployed.REDEX_CONFIG_PUB);
  const client = buildWhirlpoolClient(ctx);

  const pool1Pubkey = new PublicKey(
    "821DMXhpkLqf5AbW9ZTprVADP4LAKoQbsCKBmC6ASDKy"
  );
  const pool2Pubkey = new PublicKey(
    "FpejW17TmKF57YfZoaC12awYiAwjPryizmbgKq1weukx"
  );

  const pool1 = await client.getPool(pool1Pubkey);
  const pool2 = await client.getPool(pool2Pubkey);

  // Get swap1 quotes
  const token1A = pool1.getTokenAInfo();
  const token1B = pool1.getTokenBInfo();
  const tokenInput1 = token1A; // NOTE: currently hard fix, need handling sorted token for this
  const tokenOutput1 = token1B;

  const amount1 = 1; // 1 RENEC
  const quote1 = await swapQuoteByInputToken(
    pool1,
    tokenInput1.mint,
    DecimalUtil.toU64(new Decimal(Number(amount1)), tokenInput1.decimals),
    Percentage.fromDecimal(new Decimal(SLIPPAGE)),
    client.getContext().program.programId,
    client.getContext().fetcher,
    true
  );

  // Get swap2 quotes
  const token2A = pool2.getTokenAInfo();
  const token2B = pool2.getTokenBInfo();
  const tokenInput2 = token2B; // NOTE: currently hard fix, need handling sorted token for this

  const quote2 = await swapQuoteByInputToken(
    pool2,
    tokenInput2.mint,
    DecimalUtil.toU64(
      new Decimal(Number(quote1.estimatedAmountOut)),
      tokenInput2.decimals - tokenOutput1.decimals
    ),
    Percentage.fromDecimal(new Decimal(SLIPPAGE)),
    client.getContext().program.programId,
    client.getContext().fetcher,
    true
  );

  // Get swap ix
  let swap1 = await pool1.swap(quote1);
  let swap2 = await pool2.swap(quote2);

  let instruction1 = swap1.compressIx(true);
  let instruction2 = swap2.compressIx(true);

  // Get correct instruction 2
  instruction2 = construct_swap_2_instruction(instruction1, instruction2);

  // Append instruction 2 to transaction 1
  swap1.addInstruction(instruction2);

  const txRes = await swap1.buildAndExecute();
  console.log("Tx succedeed: ", txRes);
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
