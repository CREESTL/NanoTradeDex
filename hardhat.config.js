require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
require("@nomiclabs/hardhat-ethers");
require("@openzeppelin/hardhat-upgrades");
require("@nomiclabs/hardhat-etherscan");
require("@nomicfoundation/hardhat-chai-matchers");
require("hardhat-tracer");
require("hardhat-contract-sizer");
require("solidity-coverage");
require("hardhat-gas-reporter");
require("@primitivefi/hardhat-dodoc");

const { POLYGONSCAN_API_KEY, ACC_PRIVATE_KEY, ALCHEMY_MUMBAI } = process.env;

module.exports = {
    solidity: {
        version: "0.8.9",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    networks: {
        hardhat: {
            allowUnlimitedContractSize: true,
        },
        localhost: {
            url: "http://127.0.0.1:8545",
        },
        polygon_mainnet: {
            url: `https://polygon-rpc.com`,
            accounts: [ACC_PRIVATE_KEY],
        },
        polygon_testnet: {
            url: `https://polygon-mumbai.g.alchemy.com/v2/${ALCHEMY_MUMBAI}`,
            accounts: [ACC_PRIVATE_KEY],
            gas: 18_000_000,
        },
    },
    mocha: {
        timeout: 20000000000,
    },
    paths: {
        sources: "./contracts",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts",
    },
    etherscan: {
        apiKey: {
            polygonMumbai: POLYGONSCAN_API_KEY,
        },
    },
    skipFiles: ["node_modules"],
    gasReporter: {
        enabled: true,
        url: "http://localhost:8545",
    },
    dodoc: {
        exclude: ["mocks", "lin", "errors"],
        runOnCompile: false,
        freshOutput: true,
        outputDir: "./docs/contracts",
    },
    contractSizer: {
        alphaSort: true,
        disambiguatePaths: true,
        strict: true,
        runOnCompile: false,
    },
    etherscan: {
        apiKey: {
            polygon: POLYGONSCAN_API_KEY,
            polygonMumbai: POLYGONSCAN_API_KEY,
        },
    },
};
