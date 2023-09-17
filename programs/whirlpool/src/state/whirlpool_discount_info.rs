use anchor_lang::prelude::*;

use crate::errors::ErrorCode;

pub const DISCOUNT_FEE_RATE_MUL_VALUE: u128 = 10_000;

#[account]
pub struct WhirlpoolDiscountInfo {
    pub token_conversion_fee_rate: u16, // amount of fee that will be converted into token
    pub discount_fee_rate: u16,

    pub discount_token_rate_over_token_a: u64,
}

impl WhirlpoolDiscountInfo {
    pub const LEN: usize = 8 + 2 + 2 + 8;

    pub fn initialize(
        &mut self,
        token_coversion_fee_rate: u16,
        discount_fee_rate: u16,
        discount_token_rate_over_token_a: u64,
    ) -> Result<(), ProgramError> {
        require!(
            token_coversion_fee_rate as u128 <= DISCOUNT_FEE_RATE_MUL_VALUE,
            ErrorCode::FeeRateMaxExceeded
        );

        require!(
            discount_fee_rate as u128 <= DISCOUNT_FEE_RATE_MUL_VALUE,
            ErrorCode::FeeRateMaxExceeded
        );
        self.token_conversion_fee_rate = token_coversion_fee_rate;
        self.discount_fee_rate = discount_fee_rate;
        self.discount_token_rate_over_token_a = discount_token_rate_over_token_a;

        Ok(())
    }
}
