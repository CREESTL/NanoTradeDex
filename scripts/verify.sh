#!/bin/bash
export CONFIG_NAME="./truffle-config.js"
source ./scripts/utils/generate_truffle_config.sh

generate_truffle_config "0.7.6" ".\/contracts"

if [ -z $1 ]; then
  truffle run verify OrderController --network bscTestnet
else
  if [ -z $2 ]; then
    truffle run verify $1 --network bscTestnet
  else
    if [[ $1 = "all" ]]; then
      truffle run verify OrderController --network $2
    else
      truffle run verify $1 --network $2
    fi
  fi
fi

# remove config file
rm -f $CONFIG_NAME