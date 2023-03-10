const HDWalletProvider = require('@truffle/hdwallet-provider');
require('dotenv').config();
const Web3 = require('web3');
const TronWeb = require('tronweb');

module.exports = {
  networks : {
    shasta : {
      fullHost : "https://api.shasta.trongrid.io",
      privateKey : process.env.TRON_PRIVATE_KEY,
      from : '`${process.env.TRON_DEPLOYER_ACCOUNT}`',
      consume_user_resource_percent : 100,
      fee_limit : 100000000,
      fullHost : "https://api.shasta.trongrid.io",
      solidityNode : "https://api.shasta.trongrid.io",
      eventServer : "https://api.shasta.trongrid.io",
      network_id : "2" // Match any network id
    },
    tronMainnet : {
      from : '`${process.env.TRON_DEPLOYER_ACCOUNT}`',
      privateKey : '`${process.env.TRON_PRIVATE_KEY}`',
      consume_user_resource_percent : 100,
      fee_limit : 100000000,
      fullHost : "https://api.trongrid.io",
      solidityNode : "https://api.trongrid.io",
      eventServer : "https://api.trongrid.io",
      network_id : "1" // Match any network id
    },
  },

  // Set default mocha options here, use special reporters etc.
  mocha : {
    reporter : 'eth-gas-reporter',
    gasReporter : {gasPrice : 1},
    timeout : 20000000,
  },

  contracts_directory : './flattened',
  // Configure your compilers
  compilers : {
    solc : {
      version : '0.8.0', // Fetch exact version from solc-bin (default:
                               // truffle's version)
      // docker: true,        // Use "0.5.1" you've installed locally with
      // docker (default: false)
      settings : {
        // See the solidity docs for advice about optimization and evmVersion
        optimizer : {
          enabled : false,
          runs : 999999,
        },
      },
    },
  },
  api_keys : {
    etherscan : process.env.ETHERSCAN_API_KEY,
    bscscan : process.env.BSCSCAN_API_KEY,
  },
  plugins : [ 'solidity-coverage', 'truffle-plugin-verify' ],
};
