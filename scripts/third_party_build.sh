#!/bin/bash

source ./scripts/utils/generate_truffle_config.sh

# build USDT
generate_truffle_config "0.4.17" ".\/third-party-contracts\/USDT"
truffle compile

# build USDC
generate_truffle_config "0.6.12" ".\/third-party-contracts\/USDC" "true" 1
truffle compile

# build WBTC
generate_truffle_config "0.4.24" ".\/third-party-contracts\/WBTC"
truffle compile

# copy uniswap artifacts
cp ./node_modules/@uniswap/v2-periphery/build/WETH9.json ./build/contracts
