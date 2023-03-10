#!/bin/bash
#export CONFIG_NAME="./tronbox.js"
#source ./scripts/utils/generate_truffle_config.sh

#generate_truffle_config "0.8.6" ".\/contracts"

#echo "tronbox version is $(npx tronbox version)"

if [ -z $1 ]; then
  echo "deploying OrderController to SHASTA test network"
## in case if tronbox gets fixed
#  npx tronbox migrate --network shasta --skip-dry-run --reset # option key for force re-deploy contracts
  node migrations/deploy_tron.js
else
  raise error "don't use this script to deploy to mainnet"
  #  npx tronbox migrate --network $1 --skip-dry-run --reset # option key for force re-deploy contracts
fi
# remove config file
rm -f $CONFIG_NAME
