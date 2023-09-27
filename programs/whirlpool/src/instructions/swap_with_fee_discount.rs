use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount};

use crate::{
    errors::ErrorCode,
    manager::swap_manager::*,
    state::{TickArray, Whirlpool, WhirlpoolDiscountInfo},
    util::{
        burn_token, calculate_equivalent_discount_token_amount, to_timestamp_u64,
        update_and_swap_whirlpool, SwapTickSequence,
    },
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

    #[account(mut, constraint= discount_token_owner_account.mint == discount_token.key())]
    pub discount_token_owner_account: Box<Account<'info, TokenAccount>>,
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
    let discount_token_owner_account = &ctx.accounts.discount_token_owner_account;

    whirlpool.require_enabled()?;
    let clock = Clock::get()?;
    // Update the global reward growth which increases as a function of time.
    let timestamp = to_timestamp_u64(clock.unix_timestamp)?;
    let mut swap_tick_sequence = SwapTickSequence::new(
        ctx.accounts.tick_array_0.load_mut().unwrap(),
        ctx.accounts.tick_array_1.load_mut().ok(),
        ctx.accounts.tick_array_2.load_mut().ok(),
    );

    let (swap_update, discount_amount_accumulated, burn_fee_accumulated) = swap_with_fee_discount(
        &whirlpool,
        &whirlpool_discount_info,
        &mut swap_tick_sequence,
        amount,
        sqrt_price_limit,
        amount_specified_is_input,
        a_to_b,
        timestamp,
    )?;

    let burn_amount_in_discount_token = calculate_equivalent_discount_token_amount(
        whirlpool_discount_info,
        discount_token,
        &swap_update,
        burn_fee_accumulated,
        amount_specified_is_input,
        a_to_b,
    )?;

    let discount_token_amount_in_discount_token = calculate_equivalent_discount_token_amount(
        whirlpool_discount_info,
        discount_token,
        &swap_update,
        discount_amount_accumulated,
        amount_specified_is_input,
        a_to_b,
    )?;

    msg!(
        "SAVE: token: {:?} - amount: {}",
        discount_token.key(),
        discount_token_amount_in_discount_token
    );
    msg!(
        "BURN: token: {:?} - amount: {}",
        discount_token.key(),
        burn_amount_in_discount_token
    );

    burn_token(
        discount_token.to_account_info(),
        discount_token_owner_account.to_account_info(),
        ctx.accounts.token_authority.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        burn_amount_in_discount_token,
    )?;

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
