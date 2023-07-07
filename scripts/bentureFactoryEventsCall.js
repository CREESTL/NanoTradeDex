const { ethers, network, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");
const delay = require("delay");
require("dotenv").config();

// JSON file to keep information about previous deployments
const scriptInputFileName = "./scriptInput.json";
const SCRIPT_INPUT = require(scriptInputFileName);

const ipfsUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const employeeAddress = "0xD14251ECD06ed4b57D4c8b2Fcda35BaCf97c930b";
const erc20MintableAddress = "0x93d0D42c236992733beC01949B41D576D230f8E5";

async function main() {
    console.log(`[NOTICE!] Run on chain: ${network.name}`);
    const adminAcc = new ethers.Wallet(process.env.ACC_PRIVATE_KEY);
    console.log(`[NOTICE!] Executed by: ${adminAcc.address}`);

    // ====================================================

    // Get contracts
    const benture = await ethers.getContractAt("Benture", SCRIPT_INPUT[network.name]["Benture"].address);
    const bentureAdmin = await ethers.getContractAt("BentureAdmin", SCRIPT_INPUT[network.name]["BentureAdmin"].address);
    const bentureFactory = await ethers.getContractAt("BentureFactory", SCRIPT_INPUT[network.name]["BentureFactory"].address);
    const bentureSalary = await ethers.getContractAt("BentureSalary", SCRIPT_INPUT[network.name]["BentureSalary"].address);
    const bentureDex = await ethers.getContractAt("BentureDex", SCRIPT_INPUT[network.name]["BentureDex"].address);
    const erc20Mintable = await ethers.getContractAt("ERC20Mintable", erc20MintableAddress);

    // ====================================================

    // Call BentureFactory contract functions

    console.log("Start emit BentureFactory events....");
    // Event CreateERC20Token, event PoolCreated in Benture and event AdminTokenCreated in BentureAdmin
    await bentureFactory.createERC20Token(
        "Dummy",
        "DMM",
        ipfsUrl,
        18,
        true,
        ethers.utils.parseUnits("1000000000", 18),
        bentureAdmin.address
    );
    console.log("OrigToken created");
    await delay(10000);

    // Get the address of the last ERC20 token produced in the factory
    let origTokenAddress = await bentureFactory.lastProducedToken();
    SCRIPT_INPUT[network.name]["OrigToken"].address = origTokenAddress;

    // Deploy another ERC20 in order to have a distToken
    await bentureFactory.createERC20Token(
        "Slummy",
        "SMM",
        ipfsUrl,
        18,
        true,
        ethers.utils.parseUnits("1000000000", 18),
        bentureAdmin.address
    );
    console.log("DistToken created");
    await delay(10000);
    // The address of `lastProducedToken` of factory gets changed here
    let distTokenAddress = await bentureFactory.lastProducedToken();
    SCRIPT_INPUT[network.name]["DistToken"].address = distTokenAddress;
    console.log("Finish emit BentureFactory events....");

    console.log("Write addresses in scriptInput.json");

    fs.writeFileSync(
        path.resolve(__dirname, scriptInputFileName),
        JSON.stringify(SCRIPT_INPUT, null, "  ")
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
