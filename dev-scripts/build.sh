
#!/bin/bash

# gen new program id
anchor keys list

PROGRAM_NAME_UNDERSCORE=${PROGRAM_NAME//-/_}
PROGRAM_ID=$(solana address -k target/deploy/$PROGRAM_NAME_UNDERSCORE-keypair.json)

# Set the file path
FILE_PATH="programs/$PROGRAM_NAME/src/lib.rs"

# Make sure the file exists
if [ ! -f "$FILE_PATH" ]; then
    echo "Error: File not found: $FILE_PATH"
    exit 1
fi

echo "expected program id: $PROGRAM_ID"

# update program id to the config.json file
CONFIG_JSON_FILE_PATH="scripts/create_pool/config.json"

# Replace the existing declare_id! line with the new PROGRAM_ID
if [[ "$OSTYPE" == "darwin"* ]]; then
    # Mac OSX
    sed -i "" "s/declare_id!(\"[^\"]*\")/declare_id!(\"$PROGRAM_ID\")/g" "$FILE_PATH"
    sed -i "" "s/\"REDEX_PROGRAM_ID\": \"[^\"]*\"/\"REDEX_PROGRAM_ID\": \"$PROGRAM_ID\"/g" "$CONFIG_JSON_FILE_PATH"
else
    # Linux and others
    sed -i "s/declare_id!(\"[^\"]*\")/declare_id!(\"$PROGRAM_ID\")/g" "$FILE_PATH"
    sed -i "s/\"REDEX_PROGRAM_ID\": \"[^\"]*\"/\"REDEX_PROGRAM_ID\": \"$PROGRAM_ID\"/g" "$CONFIG_JSON_FILE_PATH"
fi

# Get program id from the file
UPDATED_PROGRAM_ID=$(grep -E 'declare_id!\("[A-Za-z0-9]{43,44}"\);' "$FILE_PATH" | grep -oE '[A-Za-z0-9]{43,44}')
echo "updated program id: $UPDATED_PROGRAM_ID"

# Compare it to the existing PROGRAM_ID
if [[ "$PROGRAM_ID" != "$UPDATED_PROGRAM_ID" ]]; then
    echo "Warning: PROGRAM_ID does not match the UPDATED_PROGRAM_ID"
    exit 1
fi

# Build the program 
anchor build 

# Copy the artifacts into the app's artifacts folder
cp target/idl/$PROGRAM_NAME_UNDERSCORE.json sdk/src/artifacts/
cp target/types/$PROGRAM_NAME_UNDERSCORE.ts sdk/src/artifacts/