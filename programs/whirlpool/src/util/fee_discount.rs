use crate::{
    errors::ErrorCode, manager::swap_manager::PostSwapUpdate, state::WhirlpoolDiscountInfo,
};
use anchor_lang::{prelude::CpiContext, ToAccountInfo};
use anchor_spl::token::{self, Burn, Mint};
use solana_program::{account_info::AccountInfo, program_error::ProgramError};

pub fn calculate_equivalent_discount_token_amount(
    whirlpool_discount_info: &WhirlpoolDiscountInfo,
    discount_token: &Mint,
    post_swap_update: &PostSwapUpdate,
    amount: u64,
    amount_specified_is_input: bool,
    a_to_b: bool,
) -> Result<u64, ErrorCode> {
    // fee in token A
    let amount_u128 = amount as u128;
    let mut amount_in_token_a = amount_u128;

    // if fee discount in token B
    if a_to_b != amount_specified_is_input {
        amount_in_token_a = (amount_u128 * post_swap_update.amount_a as u128)
            .checked_div(post_swap_update.amount_b as u128)
            .ok_or(ErrorCode::DivideByZero)?;
    }

    // calculate equivalent value in discount token
    let amount_in_discount_token = amount_in_token_a
        .checked_mul(10u128.pow(discount_token.decimals as u32))
        .ok_or(ErrorCode::MultiplicationOverflow)?
        .checked_div(whirlpool_discount_info.discount_token_rate_over_token_a as u128)
        .ok_or(ErrorCode::DivideByZero)?;

    // Check if the value fits within u64
    if amount_in_discount_token > u64::MAX as u128 {
        return Err(ErrorCode::NumberCastError);
    }

    // Cast back to u64
    Ok(amount_in_discount_token as u64)
}

pub fn burn_token<'info>(
    token_mint: AccountInfo<'info>,
    from: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    amount: u64,
) -> Result<(), ProgramError> {
    let cpi_accounts = Burn {
        mint: token_mint.to_account_info(),
        to: from.to_account_info(),
        authority: authority.to_account_info(),
    };

    // Create the CpiContext we need for the request
    let cpi_ctx = CpiContext::new(token_program.to_account_info(), cpi_accounts);

    // Execute anchor's helper function to burn tokens
    token::burn(cpi_ctx, amount)?;

    Ok(())
}
