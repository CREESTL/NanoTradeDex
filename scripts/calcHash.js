const { ethers, network, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");
const delay = require("delay");
require("dotenv").config();

const {
    getTxHashMatch,
    getTxHashMarket,
    hashAndSignMatch,
    hashAndSignMarket,
    calcFeeAmount,
    calcBuyerLockAmount,
    calcBuyerSpentAmount,
    calcSellerSpentAmount,
} = require("../test/utils.js");

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
    const origToken = await ethers.getContractAt("BentureProducedToken", SCRIPT_INPUT[network.name]["OrigToken"].address);
    const distToken = await ethers.getContractAt("BentureProducedToken", SCRIPT_INPUT[network.name]["DistToken"].address);

    // let signatureMarketBuy = await hashAndSignMarket(
    //     bentureDex.address,
    //     origToken.address,
    //     distToken.address,
    //     buyAmount,
    //     slippage,
    //     7
    // );

    // let signatureMarketSell = await hashAndSignMarket(
    //     bentureDex.address,
    //     distToken.address,
    //     origToken.address,
    //     buyAmount,
    //     slippage,
    //     8
    // );

    let signatureMatch = await hashAndSignMatch(
        bentureDex.address,
        10,
        [11],
        11
    );

    console.log(signatureMatch);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
