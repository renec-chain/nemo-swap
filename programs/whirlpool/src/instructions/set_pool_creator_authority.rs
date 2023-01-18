use anchor_lang::prelude::*;

use crate::state::WhirlpoolsConfig;

#[derive(Accounts)]
pub struct SetPoolCreatorAuthority<'info> {
    #[account(mut)]
    pub whirlpools_config: Account<'info, WhirlpoolsConfig>,

    #[account(address = whirlpools_config.pool_creator_authority)]
    pub pool_creator_authority: Signer<'info>,

    pub new_pool_creator_authority: UncheckedAccount<'info>,
}

/// Set the pool creator authority. Only the current pool creator authority has permission to invoke this instruction.
pub fn handler(ctx: Context<SetPoolCreatorAuthority>) -> ProgramResult {
    Ok(ctx
        .accounts
        .whirlpools_config
        .update_pool_creator_authority(ctx.accounts.new_pool_creator_authority.key()))
}
