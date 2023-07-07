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
    const bentureAdmin = await ethers.getContractAt("BentureAdmin", SCRIPT_INPUT[network.name]["BentureAdmin"].address);
    const bentureFactory = await ethers.getContractAt("BentureFactory", SCRIPT_INPUT[network.name]["BentureFactory"].address);
    const bentureSalary = await ethers.getContractAt("BentureSalary", SCRIPT_INPUT[network.name]["BentureSalary"].address);
    const bentureDex = await ethers.getContractAt("BentureDex", SCRIPT_INPUT[network.name]["BentureDex"].address);
    const erc20Mintable = await ethers.getContractAt("ERC20Mintable", erc20MintableAddress);
    const origToken = await ethers.getContractAt("BentureProducedToken", SCRIPT_INPUT[network.name]["OrigToken"].address);
    const distToken = await ethers.getContractAt("BentureProducedToken", SCRIPT_INPUT[network.name]["DistToken"].address);

    // ====================================================
    // Call Benture contract functions

    let lockAmount = ethers.utils.parseUnits("2000", 6);
    let claimAmount = ethers.utils.parseUnits("100", 6);

    console.log("Start emit Benture events....");
    // Event TokensLocked
    await benture.lockTokens(origToken.address, lockAmount);
    console.log("OrigTokens locked");
    await delay(10000);

    // Event TokensUnlocked
    await benture.unlockTokens(origToken.address, lockAmount.div(ethers.BigNumber.from(2)));
    console.log("OrigTokens unlocked");
    await delay(10000);

    // Event DividendsStarted
    await benture.distributeDividends(
        origToken.address,
        distToken.address,
        claimAmount,
        true
    );
    console.log("Dividents distributed");
    await delay(10000);

    // get distribution ID
    const distributionIds = await benture.getDistributions(adminAcc.address);

    // Event DividendsClaimed
    await benture.claimDividends(distributionIds[0]);
    console.log("Dividents claimed");
    await delay(10000);

    // Event CustomDividendsDistributed
    await benture.distributeDividendsCustom(
        distToken.address,
        [employeeAddress.address],
        [lockAmount]
    );
    console.log("Custom dividents distributed");
    await delay(10000);

    // Distribute additional dividends
    await benture.distributeDividends(
        origToken.address,
        distToken.address,
        claimAmount,
        true
    );
    console.log("Additional dividents distributed");
    await benture.distributeDividends(
        origToken.address,
        distToken.address,
        claimAmount,
        true
    );
    console.log("Additional dividents distributed");
    await delay(10000);

    // Event MultipleDividendsClaimed
    await benture.claimMultipleDividends(await benture.getDistributions(adminAcc.address));
    console.log("Multiple dividents claimed");
    console.log("Finish emit Benture events....");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
