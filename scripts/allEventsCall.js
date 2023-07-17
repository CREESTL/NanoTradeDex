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
const erc20MintableAddress = "0x93d0D42c236992733beC01949B41D576D230f8E5";

async function main() {
    console.log(`[NOTICE!] Run on chain: ${network.name}`);
    const adminAcc = new ethers.Wallet(process.env.ACC_PRIVATE_KEY);
    const employeeAcc = new ethers.Wallet(process.env.EMPLOYEE_PRIVATE_KEY, ethers.provider);
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

    // Call BentureFactory contract functions

    console.log("Start emit BentureFactory events....");
    // Event CreateERC20Token, event PoolCreated in Benture and event AdminTokenCreated in BentureAdmin
    // await bentureFactory.createERC20Token(
    //     "Dummy",
    //     "DMM",
    //     ipfsUrl,
    //     18,
    //     true,
    //     ethers.utils.parseUnits("1000000000", 18),
    //     bentureAdmin.address
    // );
    // console.log("OrigToken created");
    // await delay(10000);

    // // Get the address of the last ERC20 token produced in the factory
    // let origTokenAddress = await bentureFactory.lastProducedToken();
    // SCRIPT_INPUT[network.name]["OrigToken"].address = origTokenAddress;
    // let origToken = await ethers.getContractAt(
    //     "BentureProducedToken",
    //     origTokenAddress
    // );

    // // Deploy another ERC20 in order to have a distToken
    // await bentureFactory.createERC20Token(
    //     "Slummy",
    //     "SMM",
    //     ipfsUrl,
    //     18,
    //     true,
    //     ethers.utils.parseUnits("1000000000", 18),
    //     bentureAdmin.address
    // );
    // console.log("DistToken created");
    // await delay(10000);
    // // The address of `lastProducedToken` of factory gets changed here
    // let distTokenAddress = await bentureFactory.lastProducedToken();
    // SCRIPT_INPUT[network.name]["DistToken"].address = distTokenAddress;
    // let distToken = await ethers.getContractAt(
    //     "BentureProducedToken",
    //     distTokenAddress
    // );

    // fs.writeFileSync(
    //     path.resolve(__dirname, scriptInputFileName),
    //     JSON.stringify(SCRIPT_INPUT, null, "  ")
    // );

    // console.log("Finish emit BentureFactory events....");

    // // ====================================================
    // // Call BentureProducedToken contract functions

    // console.log("Start emit BentureProducedToken events....");
    // // Event ProjectTokenMinted
    let mintAmount = ethers.utils.parseUnits("1000000", 6);
    let burnAmount = ethers.utils.parseUnits("100", 6);
    let transferAmount = ethers.utils.parseUnits("100", 6);
    let lockAmount = ethers.utils.parseUnits("2000", 6);
    let claimAmount = ethers.utils.parseUnits("100", 6);
    
    // await origToken.mint(adminAcc.address, mintAmount);
    // console.log("OrigToken minted");
    // await delay(10000);
    // await distToken.mint(adminAcc.address, mintAmount);
    // console.log("DistToken minted");
    // await delay(10000);

    // // Event ProjectTokenBurnt
    // await origToken.burn(burnAmount);
    // console.log("OrigToken burned");
    // await delay(10000);

    // // Event ProjectTokenTransferred
    // await origToken.transfer(employeeAddress, transferAmount);
    // console.log("OrigToken transfered");
    // await delay(10000);

    // // Approve tokens for next calls
    // await distToken.approve(benture.address, ethers.utils.parseUnits("10000000", 6));
    // console.log("DistToken approved for benture");
    // await delay(10000);
    // await origToken.approve(benture.address, ethers.utils.parseUnits("10000000", 6));
    // console.log("OrigToken approved for benture");
    // await delay(10000);
    // await distToken.approve(bentureDex.address, ethers.utils.parseUnits("10000000", 6));
    // console.log("DistToken approved for bentureDex");
    // await delay(10000);
    // await origToken.approve(bentureDex.address, ethers.utils.parseUnits("10000000", 6));
    // console.log("OrigToken approved for bentureDex");
    // console.log("Finish emit BentureProducedToken events....");

    // // ====================================================
    // // Call Benture contract functions

    // console.log("Start emit Benture events....");
    // // Event TokensLocked
    // await benture.lockTokens(origToken.address, lockAmount);
    // console.log("OrigTokens locked");
    // await delay(10000);

    // // Event TokensUnlocked
    // await benture.unlockTokens(origToken.address, lockAmount.div(ethers.BigNumber.from(2)));
    // console.log("OrigTokens unlocked");
    // await delay(10000);

    // // Event DividendsStarted
    // await benture.distributeDividends(
    //     origToken.address,
    //     distToken.address,
    //     claimAmount,
    //     true
    // );
    // console.log("Dividents distributed");
    // await delay(10000);

    // // get distribution ID
    // let distributionIds = await benture.getDistributions(adminAcc.address);

    // // Event DividendsClaimed
    // await benture.claimDividends(distributionIds[0]);
    // console.log("Dividents claimed");
    // await delay(10000);

    // // Event CustomDividendsDistributed
    // await benture.distributeDividendsCustom(
    //     distToken.address,
    //     [employeeAcc.address],
    //     [lockAmount]
    // );
    // console.log("Custom dividents distributed");
    // await delay(10000);

    // // Distribute additional dividends
    // await benture.distributeDividends(
    //     origToken.address,
    //     distToken.address,
    //     claimAmount,
    //     true
    // );
    // console.log("Additional dividents distributed");
    // await benture.distributeDividends(
    //     origToken.address,
    //     distToken.address,
    //     claimAmount,
    //     true
    // );
    // console.log("Additional dividents distributed");
    // await delay(10000);

    // distributionIds = await benture.getDistributions(adminAcc.address);
    // let notClaimedIds = [];
    // for (let i = 0; i < distributionIds.length; i++) {
    //     if (!(await benture.hasClaimed(distributionIds[i], adminAcc.address))) {
    //         notClaimedIds.push(distributionIds[i]);
    //     }
    // }

    // // Event MultipleDividendsClaimed
    // await benture.claimMultipleDividends(notClaimedIds);
    // console.log("Multiple dividents claimed");
    // await delay(10000);
    // console.log("Finish emit Benture events....");

    // // ====================================================
    // // Call BentureSalary contract functions

    // console.log("Start emit BentureSalary events....");
    // // Set variables for function calls
    // await erc20Mintable.mint(adminAcc.address, mintAmount);
    // console.log("MockERC20 minted");
    // await delay(10000);
    // await erc20Mintable.approve(bentureSalary.address, mintAmount);
    // console.log("MockERC20 approved");
    // await delay(10000);
    // let periodDuration = 60;
    // let amountOfPeriods = 10;
    // let tokenAddress = erc20Mintable.address;
    // let tokensAmountPerPeriod = [
    //     10, 10, 10, 10, 10, 10, 10, 10, 10, 10,
    // ];

    // // Event EmployeeAdded
    // await bentureSalary.addEmployeeToProject(employeeAddress, origToken.address);
    // console.log("Employee added to project orig");
    // await delay(10000);
    // await bentureSalary.addEmployeeToProject(employeeAddress, distToken.address);
    // console.log("Employee added to project dist");
    // await delay(10000);

    // // Event EmployeeSalaryAdded
    // await bentureSalary.addSalaryToEmployee(
    //     employeeAddress,
    //     origToken.address,
    //     periodDuration,
    //     amountOfPeriods,
    //     tokenAddress,
    //     tokensAmountPerPeriod
    // );
    // console.log("Salary added to amployee");
    // await delay(10000);

    // await bentureSalary.addSalaryToEmployee(
    //     employeeAddress,
    //     distToken.address,
    //     periodDuration,
    //     amountOfPeriods,
    //     tokenAddress,
    //     tokensAmountPerPeriod
    // );
    // console.log("Salary added to amployee");
    // await delay(10000);

    // // Event EmployeeNameChanged
    // await bentureSalary.setNameToEmployee(employeeAddress, "Test");
    // console.log("Amployee name setted");
    // await delay(10000);

    // // Event EmployeeNameRemoved
    // await bentureSalary.removeNameFromEmployee(employeeAddress);
    // console.log("Amployee name removed");
    // await delay(10000);

    // // Event SalaryPeriodsAdded
    // await bentureSalary.addPeriodsToSalary(1, [110, 120, 130]);
    // console.log("Periods added to salary");
    // await delay(10000);

    // // Event SalaryPeriodsRemoved
    // await bentureSalary.removePeriodsFromSalary(1, 3);
    // console.log("Periods removed from salary");
    // await delay(10000);

    // // Event EmployeeSalaryClaimed
    // await bentureSalary.connect(employeeAcc).withdrawSalary(1);
    // console.log("Salary withdrawn");
    // await delay(10000);
    // await bentureSalary.connect(employeeAcc).withdrawAllSalaries();
    // console.log("All salary withdrawn");
    // await delay(10000);

    // // Event EmployeeSalaryRemoved
    // await bentureSalary.removeSalaryFromEmployee(1);
    // console.log("Salary removed from employee");
    // await delay(10000);

    // // Event EmployeeRemoved
    // await bentureSalary.removeEmployeeFromProject(employeeAddress, distToken.address);
    // console.log("Employee removed from project");
    // await delay(10000);
    // console.log("Finish emit BentureSalary events....");

    // ====================================================
    // Call BentureDex contract functions

    console.log("Start emit BentureDex events....");
    // Event BackendChanged
    await bentureDex.setBackend(adminAcc.address);
    console.log("Backend setted");
    await delay(10000);

    // Event FeeRateChanged
    await bentureDex.setFee(10);
    console.log("Fee setted");
    await delay(10000);

    // Event AdminTokenChanged
    await bentureDex.setAdminToken(bentureAdmin.address);
    console.log("AdminToken setted");
    await delay(10000);

    // Event IsTokenVerifiedChanged
    await bentureDex.setIsTokenVerified(erc20Mintable.address, true);
    console.log("Token verify setted");
    await delay(10000);

    // Set variables for function calls
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
        7
    );

    let signatureMarketSell = await hashAndSignMarket(
        bentureDex.address,
        origToken.address,
        distToken.address,
        buyAmount,
        slippage,
        8
    );

    let signatureMatch = await hashAndSignMatch(
        bentureDex.address,
        5,
        [6],
        9
    );

    // Event SaleStarted and event OrderCreated
    // ID1
    await bentureDex.startSaleSingle(
        origToken.address,
        distToken.address,
        sellAmount,
        limitPrice
    );
    console.log("Single sale started");
    await delay(10000);

    // ID2
    await bentureDex.startSaleMultiple(
        origToken.address,
        distToken.address,
        [sellAmount],
        [limitPrice]
    );
    console.log("Multiple sale started");
    await delay(10000);

    // Event OrderCreated
    // ID3
    await bentureDex.buyMarket(
        origToken.address,
        distToken.address,
        buyAmount,
        slippage,
        7,
        signatureMarketBuy
    );
    console.log("Buy market order created");
    await delay(10000);

    // ID4
    await bentureDex.sellMarket(
        distToken.address,
        origToken.address,
        buyAmount,
        slippage,
        8,
        signatureMarketSell
    );
    console.log("Sell market order created");
    await delay(10000);
    
    // ID5
    await bentureDex.buyLimit(
        distToken.address,
        origToken.address,
        buyAmount,
        limitPrice
    );
    console.log("Buy limit order created");
    await delay(10000);

    // ID6
    await bentureDex.sellLimit(
        origToken.address,
        distToken.address,
        sellAmount,
        limitPrice
    );
    console.log("Sell limit order created");
    await delay(10000);

    // Event OrdersMatched
    await bentureDex.matchOrders(5, [6], 9, signatureMatch);
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

    // ====================================================
    // Call BentureAdmin contract functions

    console.log("Start emit BentureAdmin events....");
    // Event AdminTokenBurnt
    await bentureAdmin.burn(2);
    console.log("AdminToken burned");
    await delay(10000);

    // Event AdminTokenTransferred
    await bentureAdmin.transferFrom(adminAcc.address, employeeAddress, 1);
    console.log("AdminToken transfered");
    await delay(10000);

    console.log("Finish emit BentureAdmin events....");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
