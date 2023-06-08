#!/bin/bash

if [[ -n $1 ]]; then
    KEYPAIR_FILE_PATH=$1
else
    KEYPAIR_FILE_PATH="scripts/.wallets/deployer_wallet.json"
fi

PROGRAM_NAME_UNDERSCORE=${PROGRAM_NAME//-/_}

echo "Deploying $PROGRAM_NAME_UNDERSCORE to $CLUSTER_URL under $KEYPAIR_FILE_PATH"
solana program deploy target/deploy/$PROGRAM_NAME_UNDERSCORE.so --keypair $KEYPAIR_FILE_PATH --url $CLUSTER_URL