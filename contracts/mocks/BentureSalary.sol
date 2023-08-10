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

    /// @dev Mapping from user address to project token address to this user name
    mapping(address => mapping (address => string)) private names;

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

    /// @dev Mapping from employee address to project token address to salary ID
    mapping(address => mapping(address => EnumerableSetUpgradeable.UintSet))
        private employeeToProjectTokenToSalaryId;

    /// @dev Mapping from employee address to the project tokens addresses
    ///      of the projects he works on
    // One employee can work on multiple projects
    mapping(address => EnumerableSetUpgradeable.AddressSet)
        private employeeToProjectTokens;
    /// @dev Inverse mapping for `employeeToProjectToken`
    // One project can have multiple employees
    mapping(address => EnumerableSetUpgradeable.AddressSet)
        private projectTokenToEmployees;

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

    /// @notice See {IBentureSalary-getNameOfEmployee}
    function getNameOfEmployee(
        address employeeAddress,
        address projectTokenAddress
    ) external view returns (string memory name) {
        return names[employeeAddress][projectTokenAddress];
    }

    /// @notice See {IBentureSalary-getAdminsByEmployee}
    function getAdminsByEmployee(
        address employeeAddress
    ) external view returns (address[] memory admins) {
        return employeeToAdmins[employeeAddress].values();
    }

    /// @notice See {IBentureSalary-getEmployeesByAdmin}
    function getEmployeesByAdmin(
        address adminAddress
    ) external view returns (address[] memory employees) {
        return adminToEmployees[adminAddress].values();
    }

    /// @notice See {IBentureSalary-getSalariesIdByEmployeeAndAdmin}
    function getSalariesIdByEmployeeAndAdmin(
        address employeeAddress,
        address adminAddress
    ) external view returns (uint256[] memory ids) {
        return
            employeeToAdminToSalaryId[employeeAddress][adminAddress].values();
    }

    /// @notice See {IBentureSalary-getSalariesIdByEmployeeAndProjectToken}
    function getSalariesIdByEmployeeAndProjectToken(
        address employeeAddress,
        address projectTokenAddress
    ) external view returns (uint256[] memory ids) {
        return
            employeeToProjectTokenToSalaryId[employeeAddress][projectTokenAddress].values();
    }

    /// @notice See {IBentureSalary-getSalaryById}
    function getSalaryById(
        uint256 salaryId
    ) external view returns (SalaryInfo memory salary) {
        return salaryById[salaryId];
    }

    /// @notice See {IBentureSalary-setNameToEmployee}
    function setNameToEmployee(
        address employeeAddress,
        address projectTokenAddress,
        string memory name
    ) external onlyAdmin {
        _setNameToEmployee(employeeAddress, projectTokenAddress, name);
    }

    /// @notice See {IBentureSalary-editEmployeeInfo}
    function editEmployeeInfo(
        address employeeAddress,
        address projectTokenAddress,
        string memory newEmployeeName,
        address newEmployeeAddress
    ) external onlyAdmin {
        if (employeeAddress != newEmployeeAddress) {
            _removeNameFromEmployee(employeeAddress, projectTokenAddress);
        }
        _setNameToEmployee(newEmployeeAddress, projectTokenAddress, newEmployeeName);
    }

    /// @notice See {IBentureSalary-removeNameFromEmployee}
    function removeNameFromEmployee(
        address employeeAddress,
        address projectTokenAddress
    ) external onlyAdmin {
        _removeNameFromEmployee(employeeAddress, projectTokenAddress);
    }

    /// @notice See {IBentureSalary-addEmployeeToProject}
    function addEmployeeToProject(
        address employeeAddress,
        address projectToken
    ) external onlyAdmin {
        _addEmployeeToProject(employeeAddress, projectToken);
    }

    function setNameAndAddEmployeeToProject(
        address employeeAddress,
        string memory employeeName,
        address projectToken
    ) external onlyAdmin {
        _addEmployeeToProject(employeeAddress, projectToken);
        _setNameToEmployee(employeeAddress, projectToken, employeeName);
    }

    /// @notice See {IBentureSalary-removeEmployeeFromProject}
    function removeEmployeeFromProject(
        address employeeAddress,
        address projectToken
    ) external onlyAdmin {
        // Admin should be the admin of the project he wants to add employee to
        if (!checkIfAdminOfProject(msg.sender, projectToken)) {
            revert NotAdminOfProject();
        }
        // User must be on the project
        if (!checkIfUserInProject(employeeAddress, projectToken)) {
            revert EmployeeNotInProject();
        }
        // User must be an employee of the admin
        if (!checkIfUserIsEmployeeOfAdmin(msg.sender, employeeAddress)) {
            revert NotEmployeeOfAdmin();
        }
        if (
            employeeToAdminToSalaryId[employeeAddress][msg.sender].length() > 0
        ) {
            uint256[] memory ids = employeeToAdminToSalaryId[employeeAddress][
                msg.sender
            ].values();
            uint256 arrayLength = employeeToAdminToSalaryId[employeeAddress][
                msg.sender
            ].length();
            for (uint256 i = 0; i < arrayLength; i++) {
                if (salaryById[ids[i]].employer == msg.sender) {
                    removeSalaryFromEmployee(ids[i]);
                }
            }
        }

        employeeToProjectTokens[employeeAddress].remove(projectToken);
        projectTokenToEmployees[projectToken].remove(employeeAddress);

        if (!_checkEmployeeInAnotherProject(employeeAddress)) {
            adminToEmployees[msg.sender].remove(employeeAddress);
            employeeToAdmins[employeeAddress].remove(msg.sender);
        }

        emit EmployeeRemoved(employeeAddress, projectToken, msg.sender);
    }

    /// @notice See {IBentureSalary-withdrawAllSalaries}
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

    /// @notice See {IBentureSalary-withdrawSalary}
    function withdrawSalary(uint256 salaryId) external nonReentrant {
        _withdrawSalary(salaryId);
    }

    /// @notice See {IBentureSalary-removePeriodsFromSalary}
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
        emit SalaryPeriodsRemoved(salaryId, _salary.employee, msg.sender);
    }

    /// @notice See {IBentureSalary-addPeriodsToSalary}
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
        emit SalaryPeriodsAdded(_salary.id, _salary.employee, msg.sender);
    }

    /// @notice See {IBentureSalary-addSalaryToEmployee}
    function addSalaryToEmployee(
        address employeeAddress,
        address projectTokenAddress,
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

        if (!checkIfAdminOfProject(msg.sender, projectTokenAddress)) {
            revert NotAdminOfProject();
        }

        if (!checkIfUserInProject(employeeAddress, projectTokenAddress)) {
            revert EmployeeNotInProject();
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
        _salary.projectToken = projectTokenAddress;
        employeeToAdminToSalaryId[employeeAddress][msg.sender].add(_salary.id);
        employeeToProjectTokenToSalaryId[employeeAddress][projectTokenAddress].add(_salary.id);
        salaryById[_salary.id] = _salary;
        emit EmployeeSalaryAdded(_salary.id, employeeAddress, msg.sender);
    }

    /// @notice See {IBentureSalary-checkIfUserIsEmployeeOfAdmin}
    function checkIfUserIsEmployeeOfAdmin(
        address adminAddress,
        address employeeAddress
    ) public view returns (bool isEmployee) {
        return adminToEmployees[adminAddress].contains(employeeAddress);
    }

    /// @notice See {IBentureSalary-checkIfUserIsAdminOfEmployee}
    function checkIfUserIsAdminOfEmployee(
        address employeeAddress,
        address adminAddress
    ) public view returns (bool isAdmin) {
        return employeeToAdmins[employeeAddress].contains(adminAddress);
    }

    /// @notice See {IBentureSalary-checkIfUserInProject}
    function checkIfUserInProject(
        address employeeAddress,
        address projectTokenAddress
    ) public view returns (bool) {
        return
            projectTokenToEmployees[projectTokenAddress].contains(
                employeeAddress
            );
    }

    /// @notice See {IBentureSalary-checkIfAdminOfProject}
    function checkIfAdminOfProject(
        address adminAddress,
        address projectTokenAddress
    ) public view returns (bool) {
        return
            IBentureAdmin(bentureAdminToken).checkAdminOfProject(
                adminAddress,
                projectTokenAddress
            );
    }

    /// @notice See {IBentureSalary-getSalaryAmount}
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

    /// @notice See {IBentureSalary-removeSalaryFromEmployee}
    function removeSalaryFromEmployee(uint256 salaryId) public onlyAdmin {
        SalaryInfo memory _salary = salaryById[salaryId];
        if (!checkIfUserIsAdminOfEmployee(_salary.employee, msg.sender)) {
            revert NotAdminForEmployee();
        }
        if (_salary.employer != msg.sender) {
            revert NotAdminForThisSalary();
        }

        uint256 amountToPay = getSalaryAmount(salaryId);

        _salary.amountWithdrawn += amountToPay;

        employeeToAdminToSalaryId[_salary.employee][msg.sender].remove(
            salaryId
        );
        employeeToProjectTokenToSalaryId[_salary.employee][_salary.projectToken].remove(
            salaryId
        );
        delete salaryById[_salary.id];

        emit EmployeeSalaryRemoved(
            salaryId,
            _salary.employee,
            msg.sender,
            amountToPay
        );

        /// @dev Transfer tokens from the employer's wallet to the employee's wallet
        IERC20Upgradeable(_salary.tokenAddress).safeTransferFrom(
            msg.sender,
            _salary.employee,
            amountToPay
        );
    }

    function _setNameToEmployee(
        address employeeAddress,
        address projectTokenAddress,
        string memory name
    ) private {
        if (
            !checkIfUserIsAdminOfEmployee(employeeAddress, msg.sender) ||
            !checkIfAdminOfProject(msg.sender, projectTokenAddress)
        ) {
            revert NotAllowedToSetName();
        }
        if (bytes(name).length == 0) {
            revert EmptyName();
        }
        names[employeeAddress][projectTokenAddress] = name;
        emit EmployeeNameChanged(employeeAddress, projectTokenAddress, name);
    }

    function _removeNameFromEmployee(
        address employeeAddress,
        address projectTokenAddress
    ) private {
        if (
            !checkIfUserIsAdminOfEmployee(employeeAddress, msg.sender) ||
            !checkIfAdminOfProject(msg.sender, projectTokenAddress)
        ) {
            revert NotAllowedToRemoveName();
        }
        delete names[employeeAddress][projectTokenAddress];
        emit EmployeeNameRemoved(employeeAddress, projectTokenAddress);
    }

    function _addEmployeeToProject(
        address employeeAddress,
        address projectToken
    ) private {
        // Same employee cannot be added to one project more than once
        if (checkIfUserInProject(employeeAddress, projectToken)) {
            revert AlreadyInProject();
        }

        // Admin should be the admin of the project he wants to add employee to
        if (!checkIfAdminOfProject(msg.sender, projectToken)) {
            revert NotAdminOfProject();
        }

        employeeToProjectTokens[employeeAddress].add(projectToken);
        projectTokenToEmployees[projectToken].add(employeeAddress);

        adminToEmployees[msg.sender].add(employeeAddress);
        employeeToAdmins[employeeAddress].add(msg.sender);
        emit EmployeeAdded(employeeAddress, projectToken, msg.sender);
    }

    function _withdrawSalary(uint256 salaryId) private {
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

            _salary.amountWithdrawn += toPay;

            /// @dev Transfer tokens from the employer's wallet to the employee's wallet
            IERC20Upgradeable(_salary.tokenAddress).safeTransferFrom(
                _salary.employer,
                _salary.employee,
                toPay
            );

            emit EmployeeSalaryClaimed(
                salaryId,
                _salary.employee,
                _salary.employer,
                toPay
            );
        }
    }

    /// @dev The function checks if there is an employee on another project of current(msg.sender = project admin) admin
    function _checkEmployeeInAnotherProject(address employeeAddress) private view returns (bool) {
        address[] memory projects = employeeToProjectTokens[employeeAddress].values();

        for (uint256 i = 0; i < projects.length; i++) {
            if (checkIfAdminOfProject(msg.sender, projects[i])) return true;
        }

        return false;
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
