use anchor_lang::prelude::*;

use crate::state::{Whirlpool, WhirlpoolsConfig};

#[derive(Accounts)]
pub struct SetEnableFlag<'info> {
    pub whirlpools_config: Account<'info, WhirlpoolsConfig>,

    #[account(mut, has_one = whirlpools_config)]
    pub whirlpool: Account<'info, Whirlpool>,

    #[account(address = whirlpools_config.pool_creator_authority)]
    pub pool_creator_authority: Signer<'info>,
}

pub fn handler(ctx: Context<SetEnableFlag>, is_enabled: bool) -> ProgramResult {
    ctx.accounts.whirlpool.set_enable_flag(is_enabled);
    Ok(())
}
