# Initailize ReDEX protocol

This script will initialize a new ReDEX protocol and create pools to swap.

## Installation
1. In `scripts` folder, you run:
    ```bash
    yarn install
    ```
2.  Paste your key into `create_pool/wallets/payer.json` file. This account will pay transaction fee. 

    ```json
    [199,203,42,..]
    ```
    > **_NOTE:_**  This account MUST have some RENECs in balance.

3. Modify the `create_pool/config.json` file to match the connecting network.
    ```json
    {
        "RPC_ENDPOINT_URL": "https://api-testnet.renec.foundation:8899",
        "REDEX_PROGRAM_ID": "HnsHqvaUZTKfinmSHjj68UCSBNPMpmFgd9WEpcKa66YF",
        ...
    }
    ```
    + RPC_ENDPOINT_URL: is RPC endpoint of network.
    + REDEX_PROGRAM_ID: is program ID of redex which deployed on this network.
## Usage

1. If you deployed a REDEX Config account on this network before, you would paste it's the public key to the `create_pool/deployed.json` file. 
    ```json
    {
        "REDEX_CONFIG_PUB": "3zGD2b6ovpYxPBor28R8zRBq7Wm2z2zhh79uzac1PRHG"
    }
    ```

    If you don't have the REDEX Config account, you would do:
    + Paste your keys into:
        + `create_pool/wallets/fee_authority_wallet.json` file.
        + `create_pool/wallets/collect_protocol_fees_authority_wallet.json` file.
        + `create_pool/wallets/reward_emissions_supper_authority_wallet.json` file.
        ```json
        [199,203,42,..]
        ```
    + Set `PROTOCOL_FEE_RATE` which is a basis point in the `create_pool/config.json` file. E.g: 100 basis points equal 1%.
    ```json
    {
        ...,
        "PROTOCOL_FEE_RATE": 300,
        ...
    }
    ```
    + Run the below command:
    ```bash
    npm run 00_init_pool_config
    ```
    > **_NOTE:_**  the `REDEX_CONFIG_PUB` field will be filled when the command line has been done. You should store it carefully.

2. Get or initialize the fee tier accounts:
    + Set `TICK_SPACING` and `DEFAULT_FEE_RATE` of `FEE_TIERS` in the `create_pool/config.json` file.
        + `TICK_SPACING`: usually 1, 2, 8, 64, 128.
        + `DEFAULT_FEE_RATE`: The default fee rate for this fee-tier. Stored as a hundredths of a basis point. E.g: 100 basis points equal 1%.

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
    + Run the below command:

    ```bash
    npm run 01_init_fee_tier
    ```

3. Create the new pools and open the positions to deposit liquidity to the pool:
    + Set pool's parameters in `POOLS` field in the `create_pool/config.json` file.
        + `TOKEN_MINT_A`: the mint public key of token a.
        + `TOKEN_MINT_B`: the mint public key of token b.
        + `TICK_SPACING`: the tick spacing of this pair.
        + `INIT_AMOUNT_B_PER_A`: the initial price of pair. One token A will equal how much amount token B.
        + `OPEN_POSITION` (optional): `true` if you would open a new position for this pair, else `false`.
        + `LOWER_B_PER_A_PRICE` (optional): the lower price of this pair.
        + `UPPER_B_PER_A_PRICE` (optional): the upper price of this pair.
        + `SLIPPAGE` (optional): the slippage which you accept when depositing liquidity to pool. E.g: = 1 ~ 1%.
        + `INPUT_MINT` (optional): `TOKEN_MINT_A` or  `TOKEN_MINT_B` which you want to deposit.
        + `INPUT_AMOUNT` (optional): amount of `INPUT_MINT` which you want to deposit. 
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
    + Run the below command to initialize pools.
    ```bash
    npm run 02_init_pool
    ```

    + Run the below command to open the positions and deposit to them:
    ```bash
    npm run 03_open_position
    ```