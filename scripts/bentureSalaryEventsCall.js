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
    // Call BentureSalary contract functions

    let mintAmount = ethers.utils.parseUnits("10000000", 6);

    console.log("Start emit BentureSalary events....");
    // Set variables for function calls
    await erc20Mintable.mint(adminAcc.address, mintAmount);
    console.log("MockERC20 minted");
    await delay(10000);
    await erc20Mintable.approve(bentureSalary.address, mintAmount);
    console.log("MockERC20 approved");
    await delay(10000);
    let periodDuration = 60;
    let amountOfPeriods = 10;
    let tokenAddress = erc20Mintable.address;
    let tokensAmountPerPeriod = [
        10, 10, 10, 10, 10, 10, 10, 10, 10, 10,
    ];

    // Event EmployeeAdded
    await bentureSalary.addEmployeeToProject(employeeAddress, origToken.address);
    console.log("Employee added to project orig");
    await delay(10000);
    await bentureSalary.addEmployeeToProject(employeeAddress, distToken.address);
    console.log("Employee added to project dist");
    await delay(10000);

    // Event EmployeeSalaryAdded
    await bentureSalary.addSalaryToEmployee(
        employeeAddress,
        origToken.address,
        periodDuration,
        amountOfPeriods,
        tokenAddress,
        tokensAmountPerPeriod
    );
    console.log("Salary added to amployee");
    await delay(10000);

    await bentureSalary.addSalaryToEmployee(
        employeeAddress,
        distToken.address,
        periodDuration,
        amountOfPeriods,
        tokenAddress,
        tokensAmountPerPeriod
    );
    console.log("Salary added to amployee");
    await delay(10000);

    // Event EmployeeNameChanged
    await bentureSalary.setNameToEmployee(employeeAddress, "Test");
    console.log("Amployee name setted");
    await delay(10000);

    // Event EmployeeNameRemoved
    await bentureSalary.removeNameFromEmployee(employeeAddress);
    console.log("Amployee name removed");
    await delay(10000);

    // Get salary ID
    const salaryId = await bentureSalary.getSalariesIdByEmployeeAndProjectToken(
        employeeAcc.address,
        origToken.address
    );
    // Event SalaryPeriodsAdded
    await bentureSalary.addPeriodsToSalary(salaryId, [110, 120, 130]);
    console.log("Periods added to salary");
    await delay(10000);

    // Event SalaryPeriodsRemoved
    await bentureSalary.removePeriodsFromSalary(salaryId, 3);
    console.log("Periods removed from salary");
    await delay(10000);

    // Event EmployeeSalaryClaimed
    await bentureSalary.connect(employeeAcc).withdrawSalary(salaryId.toString());
    console.log("Salary withdrawn");
    await delay(10000);
    await bentureSalary.connect(employeeAcc).withdrawAllSalaries();
    console.log("All salary withdrawn");
    await delay(10000);

    // Event EmployeeSalaryRemoved
    await bentureSalary.removeSalaryFromEmployee(salaryId.toString());
    console.log("Salary removed from employee");
    await delay(10000);

    // Event EmployeeRemoved
    await bentureSalary.removeEmployeeFromProject(employeeAddress, distToken.address);
    console.log("Employee removed from project");
    console.log("Finish emit BentureSalary events....");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
