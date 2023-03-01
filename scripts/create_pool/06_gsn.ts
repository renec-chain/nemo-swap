import {
  PublicKey,
  Keypair,
  Connection,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  Token,
  AccountLayout,
} from "@solana/spl-token";
import {
  PDAUtil,
  buildWhirlpoolClient,
  PriceMath,
  swapQuoteByInputToken,
  WhirlpoolContext,
  toTx,
} from "@renec/redex-sdk";
import {
  DecimalUtil,
  Percentage,
  TransactionProcessor,
} from "@orca-so/common-sdk";
import { loadProvider, delay, getTokenMintInfo } from "./utils";
import { BorshCoder } from "@project-serum/anchor";
import Decimal from "decimal.js";
import axios from "axios";
import base58 from "bs58";
import config from "./config.json";
import deployed from "./deployed.json";

const GSN_URL = "http://localhost:3000/api";
const txType = "nemo";

async function main() {
  const { ctx } = await loadProvider();

  if (deployed.REDEX_CONFIG_PUB === "") {
    console.log(
      "ReDEX Pool Config is not found. Please run `npm run 00-create-pool-config` ."
    );
    return;
  }
  const REDEX_CONFIG_PUB = new PublicKey(deployed.REDEX_CONFIG_PUB);
  const client = buildWhirlpoolClient(ctx);
  /**
   * A pool's public key is defined by:
   *  + token a mint pub
   *  + token b mint pub
   *  + tick spacing default = 8 or 64
   */
  for (let i = 0; i < config.POOLS.length; i++) {
    const pool = config.POOLS[i];
    const mintAPub = new PublicKey(pool.TOKEN_MINT_A);
    const mintBPub = new PublicKey(pool.TOKEN_MINT_B);
    const whirlpoolPda = PDAUtil.getWhirlpool(
      ctx.program.programId,
      REDEX_CONFIG_PUB,
      mintAPub,
      mintBPub,
      pool.TICK_SPACING
    );
    console.log(whirlpoolPda.publicKey.toBase58());
    const whirlpool = await client.getPool(whirlpoolPda.publicKey);

    if (whirlpool) {
      const whirlpoolData = whirlpool.getData();
      const tokenMintA = whirlpool.getTokenAInfo();
      const tokenMintB = whirlpool.getTokenBInfo();

      const price = PriceMath.sqrtPriceX64ToPrice(
        whirlpoolData.sqrtPrice,
        tokenMintA.decimals,
        tokenMintB.decimals
      );
      const invertPrice = PriceMath.invertPrice(
        price,
        tokenMintA.decimals,
        tokenMintB.decimals
      );
      console.log("===================================================");
      console.log("POOL INFO:");
      console.log("RENEC:", tokenMintA.mint.toBase58());
      console.log("rUSDT:", tokenMintB.mint.toBase58());
      console.log("Tick spacing:", whirlpoolData.tickSpacing);
      console.log("1 RENEC =", price.toFixed(tokenMintB.decimals), "rUSDT");
      console.log(
        "1 rUSDT =",
        invertPrice.toFixed(tokenMintB.decimals),
        "RENEC"
      );
      console.log("Trade Fee rate:", whirlpoolData.feeRate);
      console.log("==================RENEC_TO_rUSDT====================");
      const inputSlippage = "1.1"; // 1.1 %
      const slippageTolerance = Percentage.fromDecimal(
        new Decimal(inputSlippage)
      );
      console.log("Slippage Tolerance:", inputSlippage, "%");

      let inputToken = tokenMintB; // convert from `tokenMintA` to `tokenMintB` => inputToken = `tokenMintA`
      let inputAmount = "1"; // 20.5 tokens
      let amountIn = new Decimal(inputAmount);

      let quote = await swapQuoteByInputToken(
        whirlpool,
        inputToken.mint,
        DecimalUtil.toU64(amountIn, inputToken.decimals),
        slippageTolerance,
        ctx.program.programId,
        ctx.fetcher,
        true
      );
      console.log(
        "Input:",
        DecimalUtil.fromU64(
          quote.estimatedAmountIn,
          inputToken.decimals
        ).toString(),
        "RENEC"
      );
      console.log(
        "Estimated received:",
        DecimalUtil.fromU64(
          quote.estimatedAmountOut,
          tokenMintB.decimals
        ).toString(),
        "rUSDT"
      );
      console.log(
        "Minimum received:",
        DecimalUtil.fromU64(
          quote.otherAmountThreshold,
          tokenMintB.decimals
        ).toString(),
        "rUSDT"
      );

      let tx = await whirlpool.swap(quote);

      // ======================GASLESS START HERE==========================================
      const { feePayer } = await getGaslessInfo();

      const { instructions, cleanupInstructions, signers } =
        tx.compressIx(true);

      const transaction = new Transaction();

      const rentExemption = await Token.getMinBalanceRentForExemptAccount(
        ctx.connection
      );

      // borrow ix: feePayer transfer rentExemption to user
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: feePayer,
          toPubkey: ctx.wallet.publicKey,
          lamports: rentExemption,
        })
      );

      for (let i = 0; i < instructions.length; i++) {
        const ix = instructions[i];
        transaction.add(ix);
      }
      for (let i = 0; i < cleanupInstructions.length; i++) {
        const ix = cleanupInstructions[i];
        transaction.add(ix);
      }

      // repay ix: user transfer rentExemption to feePayer
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: ctx.wallet.publicKey,
          toPubkey: feePayer,
          lamports: rentExemption,
        })
      );

      transaction.feePayer = feePayer;
      transaction.recentBlockhash = (
        await ctx.connection.getRecentBlockhash()
      ).blockhash;

      for (let i = 0; i < signers.length; i++) {
        const s = signers[i];
        transaction.sign(s);
      }

      const signed = await ctx.wallet.signTransaction(transaction); // only sign not send
      const txid = await sendGaslessTx(signed);
      console.log(txid);
    }
  }
}

async function sendGaslessTx(signed: Transaction) {
  const buff = signed.serialize({ requireAllSignatures: false });
  const serializedBs58 = base58.encode(buff);
  const octaneResponse = (
    await axios.post(GSN_URL + "/send", {
      transaction: serializedBs58,
      type: txType,
    })
  ).data;
  const txid = octaneResponse?.signature;
  return txid;
}

async function getGaslessInfo() {
  const response = (
    await axios.get(GSN_URL, {
      headers: { Accept: "application/json" },
    })
  ).data;
  const feePayer = new PublicKey(response.feePayer);
  return { feePayer };
}

main().catch((reason) => {
  console.log("ERROR:", reason);
});
