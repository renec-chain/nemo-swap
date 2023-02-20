use crate::{state::*, errors::ErrorCode};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount};
use spl_token::native_mint;

#[derive(Accounts)]
#[instruction(bumps: WhirlpoolBumps, tick_spacing: u16)]
pub struct InitializePool<'info> {
    pub whirlpools_config: Box<Account<'info, WhirlpoolsConfig>>,

    /// CHECK: token_mint_a will be verified in handler, 
    pub token_mint_a: UncheckedAccount<'info>,
    pub token_mint_b: Account<'info, Mint>,

    // #[account(mut)]
    #[account(address = whirlpools_config.pool_creator_authority)]
    pub pool_creator: Signer<'info>,

    #[account(init,
      seeds = [
        b"whirlpool".as_ref(),
        whirlpools_config.key().as_ref(),
        token_mint_a.key().as_ref(),
        token_mint_b.key().as_ref(),
        tick_spacing.to_le_bytes().as_ref()
      ],
      bump = bumps.whirlpool_bump,
      payer = pool_creator,
      space = Whirlpool::LEN)]
    pub whirlpool: Box<Account<'info, Whirlpool>>,

    #[account(init,
      payer = pool_creator,
      token::mint = token_mint_a,
      token::authority = whirlpool)]
    pub token_vault_a: Box<Account<'info, TokenAccount>>,

    #[account(init,
      payer = pool_creator,
      token::mint = token_mint_b,
      token::authority = whirlpool)]
    pub token_vault_b: Box<Account<'info, TokenAccount>>,

    #[account(has_one = whirlpools_config)]
    pub fee_tier: Account<'info, FeeTier>,

    #[account(address = token::ID)]
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<InitializePool>,
    bumps: WhirlpoolBumps,
    tick_spacing: u16,
    initial_sqrt_price: u128,
) -> ProgramResult {
    let token_mint_a = ctx.accounts.token_mint_a.key();
    let token_mint_b = ctx.accounts.token_mint_b.key();

    if token_mint_a.eq(&token_mint_b) {
      return Err(ErrorCode::InvalidTokenMintOrder.into());
    }
    
    // Only check Mint Info when token a is not a native mint.
    if !native_mint::check_id(&token_mint_a) {
      let mut data: &[u8] = &ctx.accounts.token_mint_a.try_borrow_data()?;
      Mint::try_deserialize(&mut data)?;

      if token_mint_a.ge(&token_mint_b) {
        return Err(ErrorCode::InvalidTokenMintOrder.into());
      }
    }

    let whirlpool = &mut ctx.accounts.whirlpool;
    let whirlpools_config = &ctx.accounts.whirlpools_config;

    let default_fee_rate = ctx.accounts.fee_tier.default_fee_rate;

    Ok(whirlpool.initialize(
        whirlpools_config,
        bumps.whirlpool_bump,
        tick_spacing,
        initial_sqrt_price,
        default_fee_rate,
        token_mint_a,
        ctx.accounts.token_vault_a.key(),
        token_mint_b,
        ctx.accounts.token_vault_b.key(),
    )?)
}
