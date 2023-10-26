use anchor_lang::prelude::*;

use crate::errors::ErrorCode;

pub const DISCOUNT_FEE_RATE_MUL_VALUE: u128 = 10_000;

#[account]
pub struct WhirlpoolDiscountInfo {
    pub token_decimals: u8,
    pub token_conversion_fee_rate: u16, // amount of fee that will be converted into token
    pub discount_fee_rate: u16,

    pub expo: u8,
    pub discount_token_rate_over_token_a: u64,
}

impl WhirlpoolDiscountInfo {
    pub const LEN: usize = 8 + 1 + 2 + 2 + 1 + 8;

    pub fn initialize(
        &mut self,
        token_deciamls: u8,
        token_coversion_fee_rate: u16,
        discount_fee_rate: u16,
        expo: u8,
        discount_token_rate_over_token_a: u64,
    ) -> Result<(), ProgramError> {
        // max token conversion rate is at 99.99% (9999) (fee after discount cannot be 0)
        require!(
            (token_coversion_fee_rate as u128) < DISCOUNT_FEE_RATE_MUL_VALUE,
            ErrorCode::FeeRateMaxExceeded
        );

        require!(
            discount_fee_rate as u128 <= DISCOUNT_FEE_RATE_MUL_VALUE,
            ErrorCode::FeeRateMaxExceeded
        );

        self.token_decimals = token_deciamls;
        self.token_conversion_fee_rate = token_coversion_fee_rate;
        self.discount_fee_rate = discount_fee_rate;
        self.expo = expo;
        self.discount_token_rate_over_token_a = discount_token_rate_over_token_a;

        Ok(())
    }
}
