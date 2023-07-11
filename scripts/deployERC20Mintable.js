const { ethers, network, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");
const delay = require("delay");
require("dotenv").config();

let contractName;

async function main() {
    console.log(`[NOTICE!] Chain of deployment: ${network.name}`);

    // ====================================================

    // Contract #1: ERC20Mintable

    contractName = "ERC20Mintable";
    console.log(`[${contractName}]: Start of Deployment...`);
    _contractProto = await ethers.getContractFactory(contractName);
    contractDeployTx = await _contractProto.deploy("Test Token", "TT");
    dex = await contractDeployTx.deployed();
    console.log(`[${contractName}]: Deployment Finished! Address: ${dex.address}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
