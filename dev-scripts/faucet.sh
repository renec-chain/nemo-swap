#!/bin/bash

AMOUNT=""

# Parse the arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --keypair_file_path)
      KEYPAIR_FILE_PATH="$2"
      shift 2
      ;;
    *)
      if [[ -z $AMOUNT ]]; then
        AMOUNT="$1"
        shift
      else
        echo "Invalid option: $1" >&2
        exit 1
      fi
      ;;
  esac
done

# Check if name is empty
if [[ -z $KEYPAIR_FILE_PATH ]]; then
  echo "Please provide a wallet name"
  exit 1
fi

# Get wallet
WALLET_ADDRESS=$(solana address -k "$KEYPAIR_FILE_PATH")


echo "Fauceting wallet on $CLUSTER_URL..."
solana airdrop $AMOUNT "$WALLET_ADDRESS" --url $CLUSTER_URL






