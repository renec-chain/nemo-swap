#!/bin/bash

# Loop 10 times
for i in {1..10}
do
   ts-node versioned-tx/create-whirlpool-lookup-table.ts
   # Optional: Sleep for a second to prevent rate limiting or to reduce load
   sleep 1
done
