# IBentureSalary



> An interface of a Salary contract.





## Methods

### addEmployee

```solidity
function addEmployee(address employeeAddress) external nonpayable
```

Adds new employee.

*Only admin can call this method.*

#### Parameters

| Name | Type | Description |
|---|---|---|
| employeeAddress | address | Address of employee. |

### addPeriodsToSalary

```solidity
function addPeriodsToSalary(uint256 salaryId, uint256[] tokensAmountPerPeriod) external nonpayable
```

Adds periods to salary

*Only admin can call this method.*

#### Parameters

| Name | Type | Description |
|---|---|---|
| salaryId | uint256 | ID of target salary |
| tokensAmountPerPeriod | uint256[] | Array of periods to add to salary |

### addSalaryToEmployee

```solidity
function addSalaryToEmployee(address employeeAddress, uint256 periodDuration, uint256 amountOfPeriods, address tokenAddress, uint256[] tokensAmountPerPeriod) external nonpayable
```

Adds salary to employee.

*Only admin can call this method.*

#### Parameters

| Name | Type | Description |
|---|---|---|
| employeeAddress | address | Address of employee. |
| periodDuration | uint256 | Duration of one period. |
| amountOfPeriods | uint256 | Amount of periods. |
| tokenAddress | address | undefined |
| tokensAmountPerPeriod | uint256[] | Amount of tokens per period. |

### checkIfUserIsAdminOfEmployee

```solidity
function checkIfUserIsAdminOfEmployee(address employeeAddress, address adminAddress) external view returns (bool isAdmin)
```

Returns true if user is admin for employee and False if not.



#### Parameters

| Name | Type | Description |
|---|---|---|
| employeeAddress | address | Address of employee. |
| adminAddress | address | Address of admin. |

#### Returns

| Name | Type | Description |
|---|---|---|
| isAdmin | bool | True if user is admin for employee. False if not. |

### checkIfUserIsEmployeeOfAdmin

```solidity
function checkIfUserIsEmployeeOfAdmin(address adminAddress, address employeeAddress) external view returns (bool isEmployee)
```

Returns true if user if employee for admin and False if not.



#### Parameters

| Name | Type | Description |
|---|---|---|
| adminAddress | address | Address of admin. |
| employeeAddress | address | Address of employee. |

#### Returns

| Name | Type | Description |
|---|---|---|
| isEmployee | bool | True if user if employee for admin. False if not. |

### getAdminsByEmployee

```solidity
function getAdminsByEmployee(address employeeAddress) external view returns (address[] admins)
```

Returns the array of admins of employee.



#### Parameters

| Name | Type | Description |
|---|---|---|
| employeeAddress | address | Address of employee. |

#### Returns

| Name | Type | Description |
|---|---|---|
| admins | address[] | The array of admins of employee. |

### getEmployeesByAdmin

```solidity
function getEmployeesByAdmin(address adminAddress) external view returns (address[] employees)
```

Returns the array of employees of admin.



#### Parameters

| Name | Type | Description |
|---|---|---|
| adminAddress | address | Address of admin. |

#### Returns

| Name | Type | Description |
|---|---|---|
| employees | address[] | The array of employees of admin. |

### getNameOfEmployee

```solidity
function getNameOfEmployee(address employeeAddress) external view returns (string name)
```

Returns the name of employee.



#### Parameters

| Name | Type | Description |
|---|---|---|
| employeeAddress | address | Address of employee. |

#### Returns

| Name | Type | Description |
|---|---|---|
| name | string | The name of employee. |

### getSalariesIdByEmployeeAndAdmin

```solidity
function getSalariesIdByEmployeeAndAdmin(address employeeAddress, address adminAddress) external view returns (uint256[] salaries)
```

Returns array of salaries of employee.



#### Parameters

| Name | Type | Description |
|---|---|---|
| employeeAddress | address | Address of employee. |
| adminAddress | address | undefined |

#### Returns

| Name | Type | Description |
|---|---|---|
| salaries | uint256[] | Array of salaries of employee. |

### getSalaryAmount

```solidity
function getSalaryAmount(uint256 salaryId) external view returns (uint256 salaryAmount)
```

Returns amount of pending salary.



#### Parameters

| Name | Type | Description |
|---|---|---|
| salaryId | uint256 | Salary ID. |

#### Returns

| Name | Type | Description |
|---|---|---|
| salaryAmount | uint256 | Amount of pending salary. |

### getSalaryById

```solidity
function getSalaryById(uint256 salaryId) external view returns (struct IBentureSalary.SalaryInfo salary)
```

Returns salary by ID.



#### Parameters

| Name | Type | Description |
|---|---|---|
| salaryId | uint256 | Id of SalaryInfo. |

#### Returns

| Name | Type | Description |
|---|---|---|
| salary | IBentureSalary.SalaryInfo | SalaryInfo by ID. |

### removeEmployee

```solidity
function removeEmployee(address employeeAddress) external nonpayable
```

Removes employee.

*Only admin can call this method.*

#### Parameters

| Name | Type | Description |
|---|---|---|
| employeeAddress | address | Address of employee. |

### removeNameFromEmployee

```solidity
function removeNameFromEmployee(address employeeAddress) external nonpayable
```

Removes name from employee.

*Only admin can call this method.*

#### Parameters

| Name | Type | Description |
|---|---|---|
| employeeAddress | address | Address of employee. |

### removePeriodsFromSalary

```solidity
function removePeriodsFromSalary(uint256 salaryId, uint256 amountOfPeriodsToDelete) external nonpayable
```

Removes periods from salary

*Only admin can call this method.*

#### Parameters

| Name | Type | Description |
|---|---|---|
| salaryId | uint256 | ID of target salary |
| amountOfPeriodsToDelete | uint256 | Amount of periods to delete from salary |

### removeSalaryFromEmployee

```solidity
function removeSalaryFromEmployee(uint256 salaryId) external nonpayable
```

Removes salary from employee.

*Only admin can call this method.*

#### Parameters

| Name | Type | Description |
|---|---|---|
| salaryId | uint256 | ID of employee salary. |

### setNameToEmployee

```solidity
function setNameToEmployee(address employeeAddress, string name) external nonpayable
```

Sets new or changes current name of the employee.

*Only admin can call this method.*

#### Parameters

| Name | Type | Description |
|---|---|---|
| employeeAddress | address | Address of employee. |
| name | string | New name of employee. |

### withdrawAllSalaries

```solidity
function withdrawAllSalaries() external nonpayable
```

Withdraws all of employee&#39;s salary.

*Anyone can call this method. No restrictions.*


### withdrawSalary

```solidity
function withdrawSalary(uint256 salaryId) external nonpayable
```

Withdraws employee&#39;s salary.

*Anyone can call this method. No restrictions.*

#### Parameters

| Name | Type | Description |
|---|---|---|
| salaryId | uint256 | IDs of employee salaries. |



## Events

### EmployeeAdded

```solidity
event EmployeeAdded(address indexed employeeAddress, address indexed adminAddress)
```

Emits when user was added to Employees of Admin



#### Parameters

| Name | Type | Description |
|---|---|---|
| employeeAddress `indexed` | address | undefined |
| adminAddress `indexed` | address | undefined |

### EmployeeNameChanged

```solidity
event EmployeeNameChanged(address indexed employeeAddress, string indexed name)
```

Emits when Employee&#39;s name was added or changed



#### Parameters

| Name | Type | Description |
|---|---|---|
| employeeAddress `indexed` | address | undefined |
| name `indexed` | string | undefined |

### EmployeeNameRemoved

```solidity
event EmployeeNameRemoved(address indexed employeeAddress)
```

Emits when name was removed from Employee



#### Parameters

| Name | Type | Description |
|---|---|---|
| employeeAddress `indexed` | address | undefined |

### EmployeeRemoved

```solidity
event EmployeeRemoved(address indexed employeeAddress, address indexed adminAddress)
```

Emits when user was removed from Employees of Admin



#### Parameters

| Name | Type | Description |
|---|---|---|
| employeeAddress `indexed` | address | undefined |
| adminAddress `indexed` | address | undefined |

### EmployeeSalaryAdded

```solidity
event EmployeeSalaryAdded(address indexed employeeAddress, address indexed adminAddress, IBentureSalary.SalaryInfo indexed salary)
```

Emits when salary was added to Employee



#### Parameters

| Name | Type | Description |
|---|---|---|
| employeeAddress `indexed` | address | undefined |
| adminAddress `indexed` | address | undefined |
| salary `indexed` | IBentureSalary.SalaryInfo | undefined |

### EmployeeSalaryClaimed

```solidity
event EmployeeSalaryClaimed(address indexed employeeAddress, address indexed adminAddress, IBentureSalary.SalaryInfo indexed salary)
```

Emits when Employee withdraws salary



#### Parameters

| Name | Type | Description |
|---|---|---|
| employeeAddress `indexed` | address | undefined |
| adminAddress `indexed` | address | undefined |
| salary `indexed` | IBentureSalary.SalaryInfo | undefined |

### EmployeeSalaryRemoved

```solidity
event EmployeeSalaryRemoved(address indexed employeeAddress, address indexed adminAddress, IBentureSalary.SalaryInfo indexed salary)
```

Emits when salary was removed from Employee



#### Parameters

| Name | Type | Description |
|---|---|---|
| employeeAddress `indexed` | address | undefined |
| adminAddress `indexed` | address | undefined |
| salary `indexed` | IBentureSalary.SalaryInfo | undefined |

### SalaryPeriodsAdded

```solidity
event SalaryPeriodsAdded(address indexed employeeAddress, address indexed adminAddress, IBentureSalary.SalaryInfo indexed salary)
```

Emits when Admin adds periods to salary



#### Parameters

| Name | Type | Description |
|---|---|---|
| employeeAddress `indexed` | address | undefined |
| adminAddress `indexed` | address | undefined |
| salary `indexed` | IBentureSalary.SalaryInfo | undefined |

### SalaryPeriodsRemoved

```solidity
event SalaryPeriodsRemoved(address indexed employeeAddress, address indexed adminAddress, IBentureSalary.SalaryInfo indexed salary)
```

Emits when Admin removes periods from salary



#### Parameters

| Name | Type | Description |
|---|---|---|
| employeeAddress `indexed` | address | undefined |
| adminAddress `indexed` | address | undefined |
| salary `indexed` | IBentureSalary.SalaryInfo | undefined |



## Errors

### AllreadyEmployee

```solidity
error AllreadyEmployee()
```






### AlreadyNotAnEmployee

```solidity
error AlreadyNotAnEmployee()
```






### EmptyName

```solidity
error EmptyName()
```






### InvalidAmountOfPeriods

```solidity
error InvalidAmountOfPeriods()
```






### NotAdminForEmployee

```solidity
error NotAdminForEmployee()
```






### NotAdminForThisSalary

```solidity
error NotAdminForThisSalary()
```






### NotAllowedToRemoveName

```solidity
error NotAllowedToRemoveName()
```






### NotAllowedToSetName

```solidity
error NotAllowedToSetName()
```






### NotEmployeeForThisSalary

```solidity
error NotEmployeeForThisSalary()
```






### NotEnoughTokensAllowed

```solidity
error NotEnoughTokensAllowed()
```






### SalaryEnded

```solidity
error SalaryEnded()
```






### ZeroAddress

```solidity
error ZeroAddress()
```







