const { ethers, network, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");
const delay = require("delay");
require("dotenv").config();

// JSON file to keep information about previous deployments
const fileName = "./deployOutput.json";
const OUTPUT_DEPLOY = require(fileName);

const backendAcc = new ethers.Wallet(process.env.BACKEND_PRIVATE_KEY);

let contractName;
let dex;

async function main() {
    console.log(`[NOTICE!] Chain of deployment: ${network.name}`);

    // ====================================================

    // Contract #1: BentureDex

    contractName = "BentureDex";
    console.log(`[${contractName}]: Start of Deployment...`);
    _contractProto = await ethers.getContractFactory(contractName);
    contractDeployTx = await _contractProto.deploy();
    dex = await contractDeployTx.deployed();
    console.log(`[${contractName}]: Deployment Finished!`);
    OUTPUT_DEPLOY[network.name][contractName].address = dex.address;

    console.log(`[${contractName}]: Setting backend address...`);
    await dex.setBackend(backendAcc.address);
    console.log(`[${contractName}]: Backend address set!`);

    console.log(
        `[${contractName}]: \n\n[NOTICE!] Don't forget to set admin token address by hand!\n\n`
    );

    // Verify
    console.log(`[${contractName}]: Start of Verification...`);

    await delay(90000);

    if (network.name === "polygon_mainnet") {
        url = "https://polygonscan.com/address/" + dex.address + "#code";
    } else if (network.name === "polygon_testnet") {
        url = "https://mumbai.polygonscan.com/address/" + dex.address + "#code";
    }

    OUTPUT_DEPLOY[network.name][contractName].verification = url;

    try {
        await hre.run("verify:verify", {
            address: dex.address,
        });
    } catch (error) {
        console.error(error);
    }
    console.log(`[${contractName}]: Verification Finished!`);

    // ====================================================

    fs.writeFileSync(
        path.resolve(__dirname, fileName),
        JSON.stringify(OUTPUT_DEPLOY, null, "  ")
    );

    console.log(
        `\n***Deployment and verification are completed!***\n***See Results in "${
            __dirname + fileName
        }" file***`
    );
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
