const { ethers, network, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");
const delay = require("delay");
require("dotenv").config();

// JSON file to keep information about previous deployments
const scriptInputFileName = "./scriptInput.json";
const SCRIPT_INPUT = require(scriptInputFileName);

const ipfsUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const erc20MintableAddress = "0x93d0D42c236992733beC01949B41D576D230f8E5";

async function main() {
    console.log(`[NOTICE!] Run on chain: ${network.name}`);
    const adminAcc = new ethers.Wallet(process.env.ACC_PRIVATE_KEY);
    const employeeAcc = new ethers.Wallet(process.env.EMPLOYEE_PRIVATE_KEY);
    const employeeAddress = employeeAcc.address;
    console.log(`[NOTICE!] Executed by: ${adminAcc.address}`);

    // ====================================================

    // Get contracts
    const benture = await ethers.getContractAt("Benture", SCRIPT_INPUT[network.name]["Benture"].address);
    const origToken = await ethers.getContractAt("BentureProducedToken", SCRIPT_INPUT[network.name]["OrigToken"].address);
    const distToken = await ethers.getContractAt("BentureProducedToken", SCRIPT_INPUT[network.name]["DistToken"].address);
    const bentureDex = await ethers.getContractAt("BentureDex", SCRIPT_INPUT[network.name]["BentureDex"].address);

    // ====================================================
    // Call BentureProducedToken contract functions

    console.log("Start emit BentureProducedToken events....");
    // Event ProjectTokenMinted
    let mintAmount = ethers.utils.parseUnits("10000000", 18);
    let burnAmount = ethers.utils.parseUnits("100", 6);
    let transferAmount = ethers.utils.parseUnits("100", 6);

    await origToken.mint(adminAcc.address, mintAmount);
    console.log("OrigToken minted");
    await delay(10000);
    await distToken.mint(adminAcc.address, mintAmount);
    console.log("DistToken minted");
    await delay(10000);

    // Event ProjectTokenBurnt
    await origToken.burn(burnAmount);
    console.log("OrigToken burned");
    await delay(10000);

    // Event ProjectTokenTransferred
    await origToken.transfer(employeeAddress, transferAmount);
    console.log("OrigToken transfered");
    await delay(10000);

    // Approve tokens for next calls
    await distToken.approve(benture.address, ethers.utils.parseUnits("10000000", 6));
    console.log("DistToken approved for benture");
    await delay(10000);
    await origToken.approve(benture.address, ethers.utils.parseUnits("10000000", 6));
    console.log("OrigToken approved for benture");
    await delay(10000);
    await distToken.approve(bentureDex.address, ethers.utils.parseUnits("10000000", 18));
    console.log("DistToken approved for bentureDex");
    await delay(10000);
    await origToken.approve(bentureDex.address, ethers.utils.parseUnits("10000000", 18));
    console.log("OrigToken approved for bentureDex");
    console.log("Finish emit BentureProducedToken events....");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
