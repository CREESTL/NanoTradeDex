// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "./interfaces/IBentureAdmin.sol";
import "./interfaces/IBentureSalary.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

/// @title Salary contract. A contract to manage salaries
contract BentureSalary is
    IBentureSalary,
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;

    /// @dev Last added salary's ID
    uint256 private lastSalaryId;

    /// @dev Address of BentureAdmin Token
    address private bentureAdminToken;

    /// @dev Mapping from user address to his name
    mapping(address => string) private names;

    /// @dev Mapping from admins address to its array of employees
    mapping(address => EnumerableSetUpgradeable.AddressSet)
        private adminToEmployees;

    /// @dev Mapping from employee address to its array of admins
    mapping(address => EnumerableSetUpgradeable.AddressSet)
        private employeeToAdmins;

    /// @dev Mapping from salary ID to its info
    mapping(uint256 => SalaryInfo) private salaryById;

    /// @dev Mapping from employee address to admin address to salary ID
    mapping(address => mapping(address => EnumerableSetUpgradeable.UintSet))
        private employeeToAdminToSalaryId;

    /// @dev Uses to check if user is BentureAdmin tokens holder
    modifier onlyAdmin() {
        IBentureAdmin(bentureAdminToken).checkOwner(msg.sender);
        _;
    }

    /// @notice Set the address of the admin token
    /// @param adminTokenAddress The address of the BentureAdmin Token
    function initialize(address adminTokenAddress) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        if (adminTokenAddress == address(0)) {
            revert ZeroAddress();
        }
        bentureAdminToken = adminTokenAddress;
    }

    /// @notice Returns the name of employee.
    /// @param employeeAddress Address of employee.
    /// @return name The name of employee.
    function getNameOfEmployee(
        address employeeAddress
    ) external view returns (string memory name) {
        return names[employeeAddress];
    }

    /// @notice Returns the array of admins of employee.
    /// @param employeeAddress Address of employee.
    /// @return admins The array of admins of employee.
    function getAdminsByEmployee(
        address employeeAddress
    ) external view returns (address[] memory admins) {
        return employeeToAdmins[employeeAddress].values();
    }

    /// @notice Returns the array of employees of admin.
    /// @param adminAddress Address of admin.
    /// @return employees The array of employees of admin.
    function getEmployeesByAdmin(
        address adminAddress
    ) external view returns (address[] memory employees) {
        return adminToEmployees[adminAddress].values();
    }

    /// @notice Returns array of salaries of employee.
    /// @param employeeAddress Address of employee.
    /// @return ids Array of salaries id of employee.
    function getSalariesIdByEmployeeAndAdmin(
        address employeeAddress,
        address adminAddress
    ) external view returns (uint256[] memory ids) {
        return
            employeeToAdminToSalaryId[employeeAddress][adminAddress].values();
    }

    /// @notice Returns salary by ID.
    /// @param salaryId Id of SalaryInfo.
    /// @return salary SalaryInfo by ID.
    function getSalaryById(
        uint256 salaryId
    ) external view returns (SalaryInfo memory salary) {
        return salaryById[salaryId];
    }

    /// @notice Sets new or changes current name of the employee.
    /// @param employeeAddress Address of employee.
    /// @param name New name of employee.
    /// @dev Only admin can call this method.
    function setNameToEmployee(
        address employeeAddress,
        string memory name
    ) external onlyAdmin {
        if (!checkIfUserIsAdminOfEmployee(employeeAddress, msg.sender)) {
            revert NotAllowedToSetName();
        }
        if (bytes(name).length == 0) {
            revert EmptyName();
        }
        names[employeeAddress] = name;
        emit EmployeeNameChanged(employeeAddress, name);
    }

    /// @notice Removes name from employee.
    /// @param employeeAddress Address of employee.
    /// @dev Only admin can call this method.
    function removeNameFromEmployee(
        address employeeAddress
    ) external onlyAdmin {
        if (!checkIfUserIsAdminOfEmployee(employeeAddress, msg.sender)) {
            revert NotAllowedToRemoveName();
        }
        delete names[employeeAddress];
        emit EmployeeNameRemoved(employeeAddress);
    }

    /// @notice Adds new employee.
    /// @param employeeAddress Address of employee.
    /// @dev Only admin can call this method.
    function addEmployee(address employeeAddress) external onlyAdmin {
        if (checkIfUserIsAdminOfEmployee(employeeAddress, msg.sender)) {
            revert AllreadyEmployee();
        }
        adminToEmployees[msg.sender].add(employeeAddress);
        employeeToAdmins[employeeAddress].add(msg.sender);
        emit EmployeeAdded(employeeAddress, msg.sender);
    }

    /// @notice Removes employee.
    /// @param employeeAddress Address of employee.
    /// @dev Only admin can call this method.
    function removeEmployee(address employeeAddress) external onlyAdmin {
        if (!checkIfUserIsEmployeeOfAdmin(msg.sender, employeeAddress)) {
            revert AlreadyNotAnEmployee();
        }

        if (
            employeeToAdminToSalaryId[employeeAddress][msg.sender].length() > 0
        ) {
            uint256[] memory id = employeeToAdminToSalaryId[employeeAddress][
                msg.sender
            ].values();
            uint256 arrayLength = employeeToAdminToSalaryId[employeeAddress][
                msg.sender
            ].length();
            for (uint256 i = 0; i < arrayLength; i++) {
                if (salaryById[id[i]].employer == msg.sender) {
                    removeSalaryFromEmployee(id[i]);
                }
            }
        }

        adminToEmployees[msg.sender].remove(employeeAddress);
        employeeToAdmins[employeeAddress].remove(msg.sender);
    }

    /// @notice Withdraws all of employee's salary.
    /// @dev Anyone can call this method. No restrictions.
    function withdrawAllSalaries() external {
        uint256 adminsLength = employeeToAdmins[msg.sender].length();
        uint256 salariesLength;
        for (uint256 i = 0; i < adminsLength; i++) {
            salariesLength = employeeToAdminToSalaryId[msg.sender][
                employeeToAdmins[msg.sender].at(i)
            ].length();
            for (uint256 k = 0; k < salariesLength; k++) {
                _withdrawSalary(
                    employeeToAdminToSalaryId[msg.sender][
                        employeeToAdmins[msg.sender].at(i)
                    ].at(k)
                );
            }
        }
    }

    /// @notice Withdraws employee's salary.
    /// @param salaryId IDs of employee salaries.
    /// @dev Anyone can call this method. No restrictions.
    function withdrawSalary(uint256 salaryId) external nonReentrant {
        _withdrawSalary(salaryId);
    }

    /// @notice Removes periods from salary
    /// @param salaryId ID of target salary
    /// @param amountOfPeriodsToDelete Amount of periods to delete from salary
    /// @dev Only admin can call this method.
    function removePeriodsFromSalary(
        uint256 salaryId,
        uint256 amountOfPeriodsToDelete
    ) external onlyAdmin nonReentrant {
        SalaryInfo storage _salary = salaryById[salaryId];
        if (
            block.timestamp - _salary.salaryStartTime >
            _salary.periodDuration * _salary.amountOfPeriods
        ) {
            revert SalaryEnded();
        }
        if (!checkIfUserIsAdminOfEmployee(_salary.employee, msg.sender)) {
            revert NotAdminForEmployee();
        }
        uint256 remainingTime = _salary.periodDuration *
            _salary.amountOfPeriods -
            amountOfPeriodsToDelete *
            _salary.periodDuration;
        if (block.timestamp - _salary.salaryStartTime >= remainingTime) {
            removeSalaryFromEmployee(salaryId);
        } else {
            for (uint256 i = 0; i < amountOfPeriodsToDelete; i++) {
                _salary.tokensAmountPerPeriod.pop();
            }
            _salary.amountOfPeriods =
                _salary.amountOfPeriods -
                amountOfPeriodsToDelete;
        }
        emit SalaryPeriodsRemoved(_salary.employee, msg.sender, _salary);
    }

    /// @notice Adds periods to salary
    /// @param salaryId ID of target salary
    /// @param tokensAmountPerPeriod Array of periods to add to salary
    /// @dev Only admin can call this method.
    function addPeriodsToSalary(
        uint256 salaryId,
        uint256[] memory tokensAmountPerPeriod
    ) external onlyAdmin nonReentrant {
        SalaryInfo storage _salary = salaryById[salaryId];
        if (
            block.timestamp - _salary.salaryStartTime >
            _salary.periodDuration * _salary.amountOfPeriods
        ) {
            revert SalaryEnded();
        }
        if (!checkIfUserIsAdminOfEmployee(_salary.employee, msg.sender)) {
            revert NotAdminForEmployee();
        }

        uint256 alreadyPayed;
        for (uint256 i = 0; i < _salary.amountOfWithdrawals; i++) {
            alreadyPayed = alreadyPayed + _salary.tokensAmountPerPeriod[i];
        }

        uint256 totalTokenAmount;
        for (uint256 i = 0; i < _salary.tokensAmountPerPeriod.length; i++) {
            totalTokenAmount =
                totalTokenAmount +
                _salary.tokensAmountPerPeriod[i];
        }

        for (uint256 i = 0; i < tokensAmountPerPeriod.length; i++) {
            totalTokenAmount = totalTokenAmount + tokensAmountPerPeriod[i];
        }

        if (
            IERC20Upgradeable(_salary.tokenAddress).allowance(
                msg.sender,
                address(this)
            ) < totalTokenAmount - alreadyPayed
        ) {
            revert NotEnoughTokensAllowed();
        }

        for (uint i = 0; i < tokensAmountPerPeriod.length; i++) {
            _salary.tokensAmountPerPeriod.push(tokensAmountPerPeriod[i]);
        }

        _salary.amountOfPeriods =
            _salary.amountOfPeriods +
            tokensAmountPerPeriod.length;
        emit SalaryPeriodsAdded(_salary.employee, msg.sender, _salary);
    }

    /// @notice Adds salary to employee.
    /// @param employeeAddress Address of employee.
    /// @param periodDuration Duration of one period.
    /// @param amountOfPeriods Amount of periods.
    /// @param tokensAmountPerPeriod Amount of tokens per period.
    /// @dev Only admin can call this method.
    function addSalaryToEmployee(
        address employeeAddress,
        uint256 periodDuration,
        uint256 amountOfPeriods,
        address tokenAddress,
        uint256[] memory tokensAmountPerPeriod
    ) external onlyAdmin nonReentrant {
        if (amountOfPeriods != tokensAmountPerPeriod.length) {
            revert InvalidAmountOfPeriods();
        }

        if (!checkIfUserIsAdminOfEmployee(employeeAddress, msg.sender)) {
            revert NotAdminForEmployee();
        }

        uint256 totalTokenAmount;
        for (uint256 i = 0; i < amountOfPeriods; i++) {
            totalTokenAmount = totalTokenAmount + tokensAmountPerPeriod[i];
        }

        if (
            IERC20Upgradeable(tokenAddress).allowance(
                msg.sender,
                address(this)
            ) < totalTokenAmount
        ) {
            revert NotEnoughTokensAllowed();
        }
        SalaryInfo memory _salary;
        lastSalaryId++;
        _salary.id = lastSalaryId;
        _salary.periodDuration = periodDuration;
        _salary.amountOfPeriods = amountOfPeriods;
        _salary.amountOfWithdrawals = 0;
        _salary.tokenAddress = tokenAddress;
        _salary.tokensAmountPerPeriod = tokensAmountPerPeriod;
        _salary.salaryStartTime = block.timestamp;
        _salary.employer = msg.sender;
        _salary.employee = employeeAddress;
        employeeToAdminToSalaryId[employeeAddress][msg.sender].add(_salary.id);
        salaryById[_salary.id] = _salary;
        emit EmployeeSalaryAdded(employeeAddress, msg.sender, _salary);
    }

    /// @notice Returns true if user is employee for admin and False if not.
    /// @param adminAddress Address of admin.
    /// @param employeeAddress Address of employee.
    /// @return isEmployee True if user is employee for admin. False if not.
    function checkIfUserIsEmployeeOfAdmin(
        address adminAddress,
        address employeeAddress
    ) public view returns (bool isEmployee) {
        return adminToEmployees[adminAddress].contains(employeeAddress);
    }

    /// @notice Returns true if user is admin for employee and False if not.
    /// @param employeeAddress Address of employee.
    /// @param adminAddress Address of admin.
    /// @return isAdmin True if user is admin for employee. False if not.
    function checkIfUserIsAdminOfEmployee(
        address employeeAddress,
        address adminAddress
    ) public view returns (bool isAdmin) {
        return employeeToAdmins[employeeAddress].contains(adminAddress);
    }

    /// @notice Returns amount of pending salary.
    /// @param salaryId Salary ID.
    /// @return salaryAmount Amount of pending salary.
    function getSalaryAmount(
        uint256 salaryId
    ) public view returns (uint256 salaryAmount) {
        SalaryInfo memory _salary = salaryById[salaryId];
        if (_salary.amountOfWithdrawals != _salary.amountOfPeriods) {
            uint256 amountToPay;
            uint256 amountOfRemainingPeriods = _salary.amountOfPeriods -
                _salary.amountOfWithdrawals;
            uint256 timePassedFromLastWithdrawal = block.timestamp -
                (_salary.amountOfWithdrawals *
                    _salary.periodDuration +
                    _salary.salaryStartTime);
            uint256 periodsPassed = timePassedFromLastWithdrawal /
                _salary.periodDuration;

            if (periodsPassed < amountOfRemainingPeriods) {
                amountToPay = _payingPeriodsCounter(_salary);

                if (
                    timePassedFromLastWithdrawal -
                        (_salary.periodDuration * (periodsPassed)) >
                    0
                ) {
                    amountToPay =
                        amountToPay +
                        (_salary.tokensAmountPerPeriod[
                            _salary.amountOfWithdrawals + periodsPassed
                        ] *
                            (timePassedFromLastWithdrawal -
                                periodsPassed *
                                _salary.periodDuration)) /
                        _salary.periodDuration;
                }
            } else {
                /// @dev The case when an employee withdraw salary after the end of all periods
                for (
                    uint256 i = _salary.amountOfWithdrawals;
                    i < _salary.amountOfWithdrawals + amountOfRemainingPeriods;
                    i++
                ) {
                    amountToPay =
                        amountToPay +
                        _salary.tokensAmountPerPeriod[i];
                }
            }
            return amountToPay;
        }
        return 0;
    }

    /// @notice Removes salary from employee.
    /// @param salaryId ID of employee salary.
    /// @dev Only admin can call this method.
    function removeSalaryFromEmployee(uint256 salaryId) public onlyAdmin {
        SalaryInfo memory _salary = salaryById[salaryId];
        if (!checkIfUserIsAdminOfEmployee(_salary.employee, msg.sender)) {
            revert NotAdminForEmployee();
        }
        if (_salary.employer != msg.sender) {
            revert NotAdminForThisSalary();
        }

        uint256 amountToPay = getSalaryAmount(salaryId);

        employeeToAdminToSalaryId[_salary.employee][msg.sender].remove(
            salaryId
        );
        delete salaryById[_salary.id];

        /// @dev Transfer tokens from the employer's wallet to the employee's wallet
        IERC20Upgradeable(_salary.tokenAddress).safeTransferFrom(
            msg.sender,
            _salary.employee,
            amountToPay
        );
    }

    function _withdrawSalary(uint256 salaryId) public {
        SalaryInfo storage _salary = salaryById[salaryId];
        if (_salary.employee != msg.sender) {
            revert NotEmployeeForThisSalary();
        }
        uint256 periodsToPay = (block.timestamp -
            (_salary.amountOfWithdrawals *
                _salary.periodDuration +
                _salary.salaryStartTime)) / _salary.periodDuration;
        if (
            periodsToPay + _salary.amountOfWithdrawals >=
            _salary.amountOfPeriods
        ) {
            /// @dev The case when an employee withdraw salary after the end of all periods
            periodsToPay =
                _salary.amountOfPeriods -
                _salary.amountOfWithdrawals;
        }

        if (periodsToPay != 0) {
            /// @dev The case when there are periods for payment
            uint256 toPay;
            for (
                uint256 i = _salary.amountOfWithdrawals;
                i < _salary.amountOfWithdrawals + periodsToPay;
                i++
            ) {
                toPay = toPay + _salary.tokensAmountPerPeriod[i];
            }

            _salary.amountOfWithdrawals =
                _salary.amountOfWithdrawals +
                periodsToPay;

            /// @dev Transfer tokens from the employer's wallet to the employee's wallet
            IERC20Upgradeable(_salary.tokenAddress).safeTransferFrom(
                _salary.employer,
                _salary.employee,
                toPay
            );

            emit EmployeeSalaryClaimed(
                _salary.employee,
                _salary.employer,
                salaryById[salaryId]
            );
        }
    }

    function _payingPeriodsCounter(
        SalaryInfo memory _salary
    ) private view returns (uint256 wholeAmountToPay) {
        uint256 timePassedFromLastWithdrawal = block.timestamp -
            (_salary.amountOfWithdrawals *
                _salary.periodDuration +
                _salary.salaryStartTime);
        uint256 periodsPassed = timePassedFromLastWithdrawal /
            _salary.periodDuration;

        for (
            uint256 i = _salary.amountOfWithdrawals;
            i < _salary.amountOfWithdrawals + periodsPassed;
            i++
        ) {
            wholeAmountToPay =
                wholeAmountToPay +
                _salary.tokensAmountPerPeriod[i];
        }

        return wholeAmountToPay;
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}
}
