# Initailize ReDEX protocol

This script will initialize a new ReDEX protocol and create pools to swap.

## Installation

1. In `scripts` folder, you run:

   ```bash
   yarn install
   ```

2. Modify the `create_pool/config.json` file to match the connecting network.
   ```json
   {
       "RPC_ENDPOINT_URL": "https://api-testnet.renec.foundation:8899",
       "REDEX_PROGRAM_ID": "HnsHqvaUZTKfinmSHjj68UCSBNPMpmFgd9WEpcKa66YF",
       ...
   }
   ```
   - RPC_ENDPOINT_URL: is RPC endpoint of network.
   - REDEX_PROGRAM_ID: is program ID of redex which deployed on this network.

## Usage

1. If you deployed a REDEX Config account on this network before, you would paste it's the public key to the `create_pool/deployed.json` file.

   ```json
   {
     "REDEX_CONFIG_PUB": "3zGD2b6ovpYxPBor28R8zRBq7Wm2z2zhh79uzac1PRHG"
   }
   ```

   If you don't have the REDEX Config account, you would do:

   - Create using `make gen-wallet` or paste your keys into:

     - `.wallets/deployer_wallet.json` file.
     - `.wallets/fee_authority_wallet.json` file.
     - `.wallets/collect_protocol_fees_authority_wallet.json` file.
     - `.wallets/reward_emissions_supper_authority_wallet.json` file.
     - `.wallets/pool_creator_authority_wallet` file.
     - `.wallets/user_wallet.json` file.

   The certain wallets are requierd in the specific files. If you encounter the error, you should check the error message and paste the keys into the correct files.

   ```json
   [199,203,42,..]
   ```

   - Set `PROTOCOL_FEE_RATE` which is a basis point in the `create_pool/config.json` file. E.g: 100 basis points equal 1%.

   ```json
   {
       ...,
       "PROTOCOL_FEE_RATE": 300,
       ...
   }
   ```

   - Run the below command:

   ```bash
   npm run 00_init_pool_config
   ```

   > **_NOTE:_** the `REDEX_CONFIG_PUB` field will be filled when the command line has been done. You should store it carefully.

2. Get or initialize the fee tier accounts:

   - Set `TICK_SPACING` and `DEFAULT_FEE_RATE` of `FEE_TIERS` in the `create_pool/config.json` file.
     - `TICK_SPACING`: usually 1, 2, 8, 64, 128.
     - `DEFAULT_FEE_RATE`: The default fee rate for this fee-tier. Stored as a hundredths of a basis point. E.g: 100 basis points equal 1%.

   ```json
   {
       ...,
       "FEE_TIERS": [
           {
               "TICK_SPACING": 8,
               "DEFAULT_FEE_RATE": 800
           },
           {
               "TICK_SPACING": 64,
               "DEFAULT_FEE_RATE": 800
           }
       ],
       ...
   }
   ```

   - Run the below command:

   ```bash
   npm run 01_init_fee_tier
   ```

3. Create the new pools and open the positions to deposit liquidity to the pool:

   - Set pool's parameters in `POOLS` field in the `create_pool/config.json` file.
     - `TOKEN_MINT_A`: the mint public key of token a.
     - `TOKEN_MINT_B`: the mint public key of token b.
     - `TICK_SPACING`: the tick spacing of this pair.
     - `INIT_AMOUNT_B_PER_A`: the initial price of pair. One token A will equal how much amount token B.
     - `OPEN_POSITION` (optional): `true` if you would open a new position for this pair, else `false`.
     - `LOWER_B_PER_A_PRICE` (optional): the lower price of this pair.
     - `UPPER_B_PER_A_PRICE` (optional): the upper price of this pair.
     - `SLIPPAGE` (optional): the slippage which you accept when depositing liquidity to pool. E.g: = 1 ~ 1%.
     - `INPUT_MINT` (optional): `TOKEN_MINT_A` or `TOKEN_MINT_B` which you want to deposit.
     - `INPUT_AMOUNT` (optional): amount of `INPUT_MINT` which you want to deposit.
       --- DISCOUNT INFO: (optional)
     - `DISCOUNT_TOKEN_MINT`: uses to discount the swap fee. This is possible if the `pool_creator_authority_wallet` has using the `07_set_discount_token` command line to set the discount info for this pool with this token.
     - `TOKEN_CONVERSION_RATE`: When swapping with fee discount, a `TOKEN_CONVERSION_RATE` is used to convert the fee to the discount token. E.g: 0.4 means for 40% value of fee will be converted to the discount token.
     - `DISCOUNT_RATE_OVER_TOKEN_CONVERTED_AMOUNT`: over the converted amount, the discount rate will be applied. E.g: 0.5 means 50% of total converted token amount will be discounted.
     - `DISCOUNT_TOKEN_RATE_OVER_TOKEN_A`: set the rate over the token A to calculate value of discount token. E.g: if `rate` = 1.2, means `1 discount token` = 1.2 `token A`.
     - `EXPO` is used to handle the float number. E.g: if `expo` == 6, we will set the rate = `rate * 10^6` to handle the float number.

   ```json
   ...,
   "POOLS": [
       {
           "TOKEN_MINT_A": "So11111111111111111111111111111111111111112",
           "TOKEN_MINT_B": "4XQyAMgtXWVNnCcLsjaxN1SXaob2P6GGW4NwKtwDDFME",
           "TICK_SPACING": 8,
           "INIT_AMOUNT_B_PER_A": "22.8",
           "OPEN_POSITION": true,
           "LOWER_B_PER_A_PRICE": "20",
           "UPPER_B_PER_A_PRICE": "25",
           "SLIPPAGE": "1",
           "INPUT_MINT": "So11111111111111111111111111111111111111112",
           "INPUT_AMOUNT": "0.2"
       }
   ]
   ```

   - Run the below command to initialize pools.

   ```bash
   npm run 02_init_pool
   ```

   - Run the below command to open the positions and deposit to them:

   ```bash
   npm run 03_open_position
   ```
