import { Instruction, resolveOrCreateATAs, TransactionBuilder, ZERO } from "@orca-so/common-sdk";
import { PublicKey } from "@solana/web3.js";
import { SwapUtils, TickArrayUtil, Whirlpool, WhirlpoolContext } from "../..";
import { SwapInput, swapIx } from "../swap-ix";
import { swapWithFeeDiscountIx } from "../swap_with_fee_discount";
import { NATIVE_MINT } from "@solana/spl-token";

export type SwapAsyncParams = {
  swapInput: SwapInput;
  whirlpool: Whirlpool;
  wallet: PublicKey;
};

/**
 * Swap instruction builder method with resolveATA & additional checks.
 * @param ctx - WhirlpoolContext object for the current environment.
 * @param params - {@link SwapAsyncParams}
 * @param refresh - If true, the network calls will always fetch for the latest values.
 * @returns
 */
export async function swapAsync(
  ctx: WhirlpoolContext,
  params: SwapAsyncParams,
  refresh: boolean
): Promise<TransactionBuilder> {
  const { wallet, whirlpool, swapInput } = params;
  const {
    aToB,
    amountSpecifiedIsInput,
    amount,
    otherAmountThreshold,
  } = swapInput;
  const txBuilder = new TransactionBuilder(ctx.connection, ctx.wallet);
  const tickArrayAddresses = [swapInput.tickArray0, swapInput.tickArray1, swapInput.tickArray2];

  let uninitializedArrays = await TickArrayUtil.getUninitializedArraysString(
    tickArrayAddresses,
    ctx.fetcher,
    refresh
  );
  if (uninitializedArrays) {
    throw new Error(`TickArray addresses - [${uninitializedArrays}] need to be initialized.`);
  }

  const data = whirlpool.getData();
  const nativeAmount = aToB && amountSpecifiedIsInput ? amount : otherAmountThreshold
  const [resolvedAtaA, resolvedAtaB] = await resolveOrCreateATAs(
    ctx.connection,
    wallet,
    [
      { tokenMint: data.tokenMintA, wrappedSolAmountIn: aToB ? nativeAmount : ZERO },
      { tokenMint: data.tokenMintB, wrappedSolAmountIn: !aToB ? nativeAmount : ZERO },
    ],
    () => ctx.fetcher.getAccountRentExempt()
  );
  const { address: ataAKey, ...tokenOwnerAccountAIx } = resolvedAtaA;
  const { address: ataBKey, ...tokenOwnerAccountBIx } = resolvedAtaB;
  txBuilder.addInstructions([tokenOwnerAccountAIx, tokenOwnerAccountBIx]);
  const inputTokenAccount = aToB ? ataAKey : ataBKey;
  const outputTokenAccount = aToB ? ataBKey : ataAKey;

  return txBuilder.addInstruction(
    swapIx(
      ctx.program,
      SwapUtils.getSwapParamsFromQuote(
        swapInput,
        ctx,
        whirlpool,
        inputTokenAccount,
        outputTokenAccount,
        wallet
      )
    )
  );
}

/**
 * Swap instruction builder method with resolveATA & additional checks.
 * @param ctx - WhirlpoolContext object for the current environment.
 * @param params - {@link SwapAsyncParams}
 * @param refresh - If true, the network calls will always fetch for the latest values.
 * @returns
 */
export async function swapAsyncWithWRenecAta(
  ctx: WhirlpoolContext,
  params: SwapAsyncParams,
  refresh: boolean,
  wRenecAta?: PublicKey
): Promise<{ tx: TransactionBuilder; createdWRenecAta: PublicKey | undefined }> {
  const { wallet, whirlpool, swapInput } = params;
  const {
    aToB,
    amountSpecifiedIsInput,
    amount,
    otherAmountThreshold,
  } = swapInput;
  const txBuilder = new TransactionBuilder(ctx.connection, ctx.wallet);
  const tickArrayAddresses = [swapInput.tickArray0, swapInput.tickArray1, swapInput.tickArray2];

  let uninitializedArrays = await TickArrayUtil.getUninitializedArraysString(
    tickArrayAddresses,
    ctx.fetcher,
    refresh
  );
  if (uninitializedArrays) {
    throw new Error(`TickArray addresses - [${uninitializedArrays}] need to be initialized.`);
  }

  const data = whirlpool.getData();

  const nativeAmount = aToB && amountSpecifiedIsInput ? amount : otherAmountThreshold
  let request = [
    { tokenMint: data.tokenMintA, wrappedSolAmountIn: aToB ? nativeAmount : ZERO },
    { tokenMint: data.tokenMintB, wrappedSolAmountIn: !aToB ? nativeAmount : ZERO },
  ];

  const [resolvedAtaA, resolvedAtaB] = await resolveOrCreateATAs(
    ctx.connection,
    wallet,
    request,
    () => ctx.fetcher.getAccountRentExempt()
  );

  let { address: ataAKey, ...tokenOwnerAccountAIx } = resolvedAtaA;
  let { address: ataBKey, ...tokenOwnerAccountBIx } = resolvedAtaB;

  let instructions: Instruction[] = [tokenOwnerAccountAIx, tokenOwnerAccountBIx];

  let createdWRenecAta: PublicKey | undefined = undefined;

  // if a is token mint
  if (data.tokenMintA.equals(NATIVE_MINT)) {
    if (wRenecAta) {
      createdWRenecAta = wRenecAta;
      ataAKey = wRenecAta;

      // remove first instruction
      instructions.shift();
    } else {
      createdWRenecAta = ataAKey;
    }
  } else if (data.tokenMintB.equals(NATIVE_MINT)) {
    if (wRenecAta) {
      createdWRenecAta = wRenecAta;
      ataBKey = wRenecAta;

      // remove second instruction
      instructions.pop();
    } else {
      createdWRenecAta = ataBKey;
    }
  }

  txBuilder.addInstructions(instructions);
  const inputTokenAccount = aToB ? ataAKey : ataBKey;
  const outputTokenAccount = aToB ? ataBKey : ataAKey;

  return {
    tx: txBuilder.addInstruction(
      swapIx(
        ctx.program,
        SwapUtils.getSwapParamsFromQuote(
          swapInput,
          ctx,
          whirlpool,
          inputTokenAccount,
          outputTokenAccount,
          wallet
        )
      )
    ),
    createdWRenecAta,
  };
}

export async function swapWithFeeDiscountAsync(
  ctx: WhirlpoolContext,
  params: SwapAsyncParams,
  discountTokenMint: PublicKey,
  refresh: boolean
): Promise<TransactionBuilder> {
  const { wallet, whirlpool, swapInput } = params;
  const {
    aToB,
    amountSpecifiedIsInput,
    amount,
    otherAmountThreshold,
  } = swapInput;
  const txBuilder = new TransactionBuilder(ctx.connection, ctx.wallet);
  const tickArrayAddresses = [swapInput.tickArray0, swapInput.tickArray1, swapInput.tickArray2];

  let uninitializedArrays = await TickArrayUtil.getUninitializedArraysString(
    tickArrayAddresses,
    ctx.fetcher,
    refresh
  );
  if (uninitializedArrays) {
    throw new Error(`TickArray addresses - [${uninitializedArrays}] need to be initialized.`);
  }

  const data = whirlpool.getData();
  const nativeAmount = aToB && amountSpecifiedIsInput ? amount : otherAmountThreshold
  const [resolvedAtaA, resolvedAtaB, resolveDiscountTokenAta] = await resolveOrCreateATAs(
    ctx.connection,
    wallet,
    [
      { tokenMint: data.tokenMintA, wrappedSolAmountIn: aToB ? nativeAmount : ZERO },
      { tokenMint: data.tokenMintB, wrappedSolAmountIn: !aToB ? nativeAmount : ZERO },
      { tokenMint: discountTokenMint, wrappedSolAmountIn: ZERO },
    ],
    () => ctx.fetcher.getAccountRentExempt()
  );
  const { address: ataAKey, ...tokenOwnerAccountAIx } = resolvedAtaA;
  const { address: ataBKey, ...tokenOwnerAccountBIx } = resolvedAtaB;
  txBuilder.addInstructions([tokenOwnerAccountAIx, tokenOwnerAccountBIx]);
  const inputTokenAccount = aToB ? ataAKey : ataBKey;
  const outputTokenAccount = aToB ? ataBKey : ataAKey;

  return txBuilder.addInstruction(
    swapWithFeeDiscountIx(
      ctx.program,
      SwapUtils.getSwapWithFeeDiscountParamsFromQuote(
        swapInput,
        ctx,
        whirlpool,
        inputTokenAccount,
        outputTokenAccount,
        wallet
      )
    )
  );
}
