const HDWalletProvider = require('@truffle/hdwallet-provider');
require('dotenv').config();
const Web3 = require('web3');
const TronWeb = require('tronweb');

module.exports = {
  networks : {
    rinkeby : {
      provider() {
        return new HDWalletProvider(
            `${process.env.MNEMONIC}`,
            `https://rinkeby.infura.io/v3/${process.env.INFURA_ID}`,
        );
      },
      network_id : 4,
      networkCheckTimeout : 10000000,
      gasLimit : 5000000,
      gasPrice : 2000000000,
      from : process.env.DEPLOYER_ACCOUNT,
      websockets : true,
      confirmations : 2,
    },

    ethereum : {
      provider : () => new HDWalletProvider(
          process.env.MNEMONIC,
          `wss://mainnet.infura.io/ws/v3/${process.env.INFURA_ID}`),
      network_id : 1,
      networkCheckTimeout : 10000000,
      gasLimit : 5000000,
      from : process.env.DEPLOYER_ACCOUNT, // contracts owner address
      websockets : true,
      confirmations : 2,
      gasPrice : 85000000000,
    },

    bscTestnet : {
      provider : () => new HDWalletProvider(
          process.env.MNEMONIC,
          'https://data-seed-prebsc-1-s1.binance.org:8545'),
      network_id : 97,
      confirmations : 2,
      timeoutBlocks : 200,
      from : process.env.DEPLOYER_ACCOUNT,
    },

    bscMainnet : {
      provider : () => new HDWalletProvider(
          process.env.MNEMONIC,
          'https://dataseed1.binance.org'),
      network_id : 56,
      confirmations : 2,
      timeoutBlocks : 200,
      from : process.env.DEPLOYER_ACCOUNT,
    },

  },

  // Set default mocha options here, use special reporters etc.
  mocha : {
    reporter : 'eth-gas-reporter',
    gasReporter : {gasPrice : 1},
    timeout : 20000000,
  },

  contracts_directory : 'contractsDirectory',
  // Configure your compilers
  compilers : {
    solc : {
      version : 'solcVersion', // Fetch exact version from solc-bin (default:
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
