// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

interface IBentureSalaryErrors {
    error ZeroAddress();
    error NotAllowedToSetName();
    error EmptyName();
    error NotAllowedToRemoveName();
    error AllreadyEmployee();
    error NotEmployeeOfAdmin();
    error NotEmployeeForThisSalary();
    error NotAdminForEmployee();
    error NotAdminOfProject();
    error EmployeeNotInProject();
    error SalaryEnded();
    error NotEnoughTokensAllowed();
    error InvalidAmountOfPeriods();
    error NotAdminForThisSalary();
    error AlreadyInProject();
}
