# Whirlpools

Whirpools is an open-source concentrated liquidity AMM contract on the Solana blockchain.
The Whirlpools Typescript SDK (`@orca-so/whirlpools-sdk`) allows for easy interaction with a deployed Whirlpools program.

The contract has been audited by Kudelski and Neodyme.

# Whirlpool SDK

Use the SDK to interact with a deployed Whirlpools program via Typescript.

## Installation

In your package, run:

```
yarn add `@orca-so/whirlpools-sdk`
yarn add "@project-serum/anchor"
yarn add "decimal.js"
```

## Usage

Read instructions on how to use the SDK on the [Orca Developer Portal](https://orca-so.gitbook.io/orca-developer-portal/orca/welcome).

## Tests

To run tests for the SDK, follow steps below:


1. Make sure your solana-cli version from 1.9 and above. You can replace v1.9.29 by another version in the future.

```
sh -c "$(curl -sSfL https://release.solana.com/v1.9.29/install)"
```

2. Run `anchor keys list` to retrieve the `declared_id` and replace it to `Anchor.toml`, also replace in `whirlpool/src/lib.rs`

```
[programs.localnet]
whirlpool = "<declared_id>"
```
3. Run `solana config set --url localhost`

4. Open new terminal and run `solana-test-validator`

5. Run

```
cd sdk
yarn install
anchor test 
```

# License

[Apache 2.0](https://choosealicense.com/licenses/apache-2.0/)
