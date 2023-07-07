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

    // ====================================================
    // Call BentureDex contract functions

    console.log("Start emit BentureDex events....");
    // // Event BackendChanged
    // await bentureDex.setBackend(adminAcc.address);
    // console.log("Backend setted");
    // await delay(10000);

    // // Event FeeRateChanged
    // await bentureDex.setFee(10);
    // console.log("Fee setted");
    // await delay(10000);

    // // Event AdminTokenChanged
    // await bentureDex.setAdminToken(bentureAdmin.address);
    // console.log("AdminToken setted");
    // await delay(10000);

    // // Event IsTokenVerifiedChanged
    // await bentureDex.setIsTokenVerified(erc20Mintable.address, true);
    // console.log("Token verify setted");
    // await delay(10000);

    // Set variables for function calls
    let mintAmount = ethers.utils.parseUnits("1000000", 6);
    let buyAmount = ethers.utils.parseUnits("10", 6);
    let sellAmount = ethers.utils.parseUnits("10", 6);
    let slippage = 10;
    let limitPrice = ethers.utils.parseUnits("1.5", 6);
    let bigLimitPrice = ethers.utils.parseUnits("10", 6);

    let signatureMarketBuy = await hashAndSignMarket(
        bentureDex.address,
        origToken.address,
        distToken.address,
        buyAmount,
        slippage,
        4
    );

    let signatureMarketSell = await hashAndSignMarket(
        bentureDex.address,
        origToken.address,
        distToken.address,
        buyAmount,
        slippage,
        5
    );

    let signatureMatch = await hashAndSignMatch(
        bentureDex.address,
        3,
        [4],
        6
    );

    // Event OrderCreated
    // ID1
    await bentureDex.buyMarket(
        origToken.address,
        distToken.address,
        buyAmount,
        slippage,
        4,
        signatureMarketBuy
    );
    console.log("Buy market order created");
    await delay(10000);

    // ID2
    await bentureDex.sellMarket(
        origToken.address,
        distToken.address,
        buyAmount,
        slippage,
        5,
        signatureMarketSell
    );
    console.log("Sell market order created");
    await delay(10000);
    
    // ID3
    await bentureDex.buyLimit(
        origToken.address,
        distToken.address,
        buyAmount,
        limitPrice
    );
    console.log("Buy limit order created");
    await delay(10000);

    // ID4
    await bentureDex.sellLimit(
        origToken.address,
        distToken.address,
        sellAmount,
        limitPrice
    );
    console.log("Sell limit order created");
    await delay(10000);

    // Event SaleStarted and event OrderCreated
    // ID5
    await bentureDex.startSaleSingle(
        origToken.address,
        distToken.address,
        sellAmount,
        limitPrice
    );
    console.log("Single sale started");
    await delay(10000);

    // ID6
    await bentureDex.startSaleMultiple(
        origToken.address,
        distToken.address,
        [sellAmount],
        [limitPrice]
    );
    console.log("Multiple sale started");
    await delay(10000);

    // Event OrdersMatched
    await bentureDex.matchOrders(3, [4], 6, signatureMatch);
    console.log("Orders matched");
    await delay(10000);

    // Event FeesWithdrawn
    await bentureDex.withdrawFees([origToken.address, distToken.address]);
    console.log("Fees withdrawn");
    await delay(10000);

    // Event PriceChanged
    // ID7
    await bentureDex.sellLimit(
        origToken.address,
        distToken.address,
        sellAmount,
        bigLimitPrice
    );
    console.log("Sell limit order created with big limitPrice");
    await delay(10000);

    // Event OrderCancelled
    await bentureDex.cancelOrder(7);
    console.log("Order canceled");
    await delay(10000);

    // Event DecimalsChanged
    await bentureDex.setDecimals(origToken.address, distToken.address, 6);
    console.log("Decimals setted");
    console.log("Finish emit BentureDex events....");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
