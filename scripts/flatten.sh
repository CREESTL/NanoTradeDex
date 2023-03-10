#!/bin/bash
export CONFIG_NAME="./truffle-config.js"
source ./scripts/utils/generate_truffle_config.sh

generate_truffle_config "0.8.0" ".\/contracts"

echo "pragma solidity ^0.8.0;" > flattened/Flattened.sol

if [ -z $1 ]; then
    truffle-flattener contracts/ForFlattened.sol | awk '!/^pragma solidity/' | awk '/SPDX-License-Identifier/&&c++>0 {next} 1' | awk '/pragma experimental ABIEncoderV2;/&&c++>0 {next} 1' >> flattened/Flattened.sol
else
    truffle-flattener $1 | awk '/SPDX-License-Identifier/&&c++>0 {next} 1' | awk '/pragma experimental ABIEncoderV2;/&&c++>0 {next} 1' >> flattened/Flattened.sol
fi

# remove config file
rm -f $CONFIG_NAME
