#!/bin/bash

export CONFIG_NAME="./truffle-config.js"
source ./scripts/utils/generate_truffle_config.sh

if [[ $1 = "+fast" ]]; then
  echo "Run tests without build!"
  generate_truffle_config "0.8.5" ".\/contracts"

  #remove +fast parameter
  shift
else
  # remove previous build
  rm -rf ./build

  # build third party contracts
  ./scripts/third_party_build.sh

  # build our contracts
  generate_truffle_config "0.8.5" ".\/contracts"
  truffle compile
fi

# run tests
if [[ $1 = "+debug" ]]; then
  node --inspect ./node_modules/.bin/truffle version
  node --inspect ./node_modules/.bin/truffle test --compile-none --stacktrace $@
  shift
else
  truffle version
  truffle test $@
fi

# remove config file
rm -f $CONFIG_NAME
