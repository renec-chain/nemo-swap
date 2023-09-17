use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount};

use crate::{
    errors::ErrorCode,
    manager::swap_manager::*,
    state::{TickArray, Whirlpool, WhirlpoolDiscountInfo},
    util::{to_timestamp_u64, update_and_swap_whirlpool, SwapTickSequence},
};

#[derive(Accounts)]
pub struct SwapWithFeeDiscount<'info> {
    #[account(address = token::ID)]
    pub token_program: Program<'info, Token>,

    pub token_authority: Signer<'info>,

    #[account(mut)]
    pub whirlpool: Box<Account<'info, Whirlpool>>,

    #[account(mut, constraint = token_owner_account_a.mint == whirlpool.token_mint_a)]
    pub token_owner_account_a: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = whirlpool.token_vault_a)]
    pub token_vault_a: Box<Account<'info, TokenAccount>>,

    #[account(mut, constraint = token_owner_account_b.mint == whirlpool.token_mint_b)]
    pub token_owner_account_b: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = whirlpool.token_vault_b)]
    pub token_vault_b: Box<Account<'info, TokenAccount>>,

    #[account(mut, has_one = whirlpool)]
    pub tick_array_0: AccountLoader<'info, TickArray>,

    #[account(mut, has_one = whirlpool)]
    pub tick_array_1: AccountLoader<'info, TickArray>,

    #[account(mut, has_one = whirlpool)]
    pub tick_array_2: AccountLoader<'info, TickArray>,

    #[account(seeds = [b"oracle", whirlpool.key().as_ref()],bump)]
    /// Oracle is currently unused and will be enabled on subsequent updates
    pub oracle: UncheckedAccount<'info>,

    /// handle fee discount
    #[account(
        seeds = [b"whirlpool_discount_info", whirlpool.key().as_ref(), discount_token.key().as_ref()],
        bump,
    )]
    pub whirlpool_discount_info: Box<Account<'info, WhirlpoolDiscountInfo>>,

    #[account(mut)]
    pub discount_token: Account<'info, Mint>,

    #[account(mut, constraint= token_discount_owner_account.mint == discount_token.key())]
    pub token_discount_owner_account: Box<Account<'info, TokenAccount>>,
}

pub fn handler(
    ctx: Context<SwapWithFeeDiscount>,
    amount: u64,
    other_amount_threshold: u64,
    sqrt_price_limit: u128,
    amount_specified_is_input: bool,
    a_to_b: bool, // Zero for one
) -> ProgramResult {
    let whirlpool = &mut ctx.accounts.whirlpool;
    let whirlpool_discount_info = &mut ctx.accounts.whirlpool_discount_info;
    let discount_token = &ctx.accounts.discount_token;
    let discount_token_owner_account = &ctx.accounts.token_discount_owner_account;

    whirlpool.require_enabled()?;
    let clock = Clock::get()?;
    // Update the global reward growth which increases as a function of time.
    let timestamp = to_timestamp_u64(clock.unix_timestamp)?;
    let mut swap_tick_sequence = SwapTickSequence::new(
        ctx.accounts.tick_array_0.load_mut().unwrap(),
        ctx.accounts.tick_array_1.load_mut().ok(),
        ctx.accounts.tick_array_2.load_mut().ok(),
    );

    let (swap_update, _, burn_fee_accumulated) = swap_with_fee_discount(
        &whirlpool,
        &whirlpool_discount_info,
        &mut swap_tick_sequence,
        amount,
        sqrt_price_limit,
        amount_specified_is_input,
        a_to_b,
        timestamp,
    )?;

    let burn_amount_in_discount_token = calculate_burn_fee_amount(
        whirlpool_discount_info,
        discount_token,
        &swap_update,
        burn_fee_accumulated,
        amount_specified_is_input,
        a_to_b,
    )?;

    // TODO: wrap this function for two hops
    let cpi_accounts = Burn {
        mint: discount_token.to_account_info(),
        to: discount_token_owner_account.to_account_info(),
        authority: ctx.accounts.token_authority.to_account_info(),
    };

    // Create the CpiContext we need for the request
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);

    // Execute anchor's helper function to burn tokens
    token::burn(cpi_ctx, burn_amount_in_discount_token)?;

    msg!(
        "BURN: token: {:?} - amount: {}",
        discount_token.key(),
        burn_amount_in_discount_token
    );

    if amount_specified_is_input {
        if (a_to_b && other_amount_threshold > swap_update.amount_b)
            || (!a_to_b && other_amount_threshold > swap_update.amount_a)
        {
            return Err(ErrorCode::AmountOutBelowMinimum.into());
        }
    } else {
        if (a_to_b && other_amount_threshold < swap_update.amount_a)
            || (!a_to_b && other_amount_threshold < swap_update.amount_b)
        {
            return Err(ErrorCode::AmountInAboveMaximum.into());
        }
    }

    update_and_swap_whirlpool(
        whirlpool,
        &ctx.accounts.token_authority,
        &ctx.accounts.token_owner_account_a,
        &ctx.accounts.token_owner_account_b,
        &ctx.accounts.token_vault_a,
        &ctx.accounts.token_vault_b,
        &ctx.accounts.token_program,
        swap_update,
        a_to_b,
        timestamp,
    )
}

fn calculate_burn_fee_amount(
    whirlpool_discount_info: &WhirlpoolDiscountInfo,
    discount_token: &Mint,
    post_swap_update: &PostSwapUpdate,
    burn_amount: u64,
    amount_specified_is_input: bool,
    a_to_b: bool,
) -> Result<u64, ErrorCode> {
    // fee in token B
    let burn_amount_u128 = burn_amount as u128;
    let mut burn_amount_in_token_a = burn_amount_u128;

    // if fee discount in token B
    if a_to_b != amount_specified_is_input {
        burn_amount_in_token_a = (burn_amount_u128 * post_swap_update.amount_a as u128)
            .checked_div(post_swap_update.amount_b as u128)
            .ok_or(ErrorCode::DivideByZero)?;
    }

    // calculate equivalent value in discount token
    let burn_amount_in_discount_token = burn_amount_in_token_a
        .checked_mul(10u128.pow(discount_token.decimals as u32))
        .ok_or(ErrorCode::MultiplicationOverflow)?
        .checked_div(whirlpool_discount_info.discount_token_rate_over_token_a as u128)
        .ok_or(ErrorCode::DivideByZero)?;

    // Check if the value fits within u64
    if burn_amount_in_discount_token > u64::MAX as u128 {
        return Err(ErrorCode::NumberCastError);
    }

    // Cast back to u64
    Ok(burn_amount_in_discount_token as u64)
}
