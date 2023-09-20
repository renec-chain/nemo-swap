use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

#[derive(Accounts)]
pub struct SetPoolDiscountInfo<'info> {
    #[account(address=whirlpool.whirlpools_config)]
    pub config: Box<Account<'info, WhirlpoolsConfig>>,
    pub whirlpool: Box<Account<'info, Whirlpool>>,

    pub discount_token: Account<'info, Mint>,

    #[account(
      mut,
      seeds = [b"whirlpool_discount_info", whirlpool.key().as_ref(), discount_token.key().as_ref()],
      bump,
     )]
    pub whirlpool_discount_info: Account<'info, WhirlpoolDiscountInfo>,

    #[account(address = config.pool_creator_authority)]
    pub pool_creator_authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<SetPoolDiscountInfo>,
    token_conversion_fee_rate: u16,
    discount_fee_rate: u16,
    discount_token_rate_over_token_a: u64,
) -> ProgramResult {
    let whirlpool_discount_info = &mut ctx.accounts.whirlpool_discount_info;
    let discount_token = &ctx.accounts.discount_token;

    whirlpool_discount_info.initialize(
        discount_token.decimals,
        token_conversion_fee_rate,
        discount_fee_rate,
        discount_token_rate_over_token_a,
    )
}
