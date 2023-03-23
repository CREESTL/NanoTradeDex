# IBentureProducedToken



> An interface for a custom ERC20 contract used in the bridge





## Methods

### allowance

```solidity
function allowance(address owner, address spender) external view returns (uint256)
```



*Returns the remaining number of tokens that `spender` will be allowed to spend on behalf of `owner` through {transferFrom}. This is zero by default. This value changes when {approve} or {transferFrom} are called.*

#### Parameters

| Name | Type | Description |
|---|---|---|
| owner | address | undefined |
| spender | address | undefined |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | uint256 | undefined |

### approve

```solidity
function approve(address spender, uint256 amount) external nonpayable returns (bool)
```



*Sets `amount` as the allowance of `spender` over the caller&#39;s tokens. Returns a boolean value indicating whether the operation succeeded. IMPORTANT: Beware that changing an allowance with this method brings the risk that someone may use both the old and the new allowance by unfortunate transaction ordering. One possible solution to mitigate this race condition is to first reduce the spender&#39;s allowance to 0 and set the desired value afterwards: https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729 Emits an {Approval} event.*

#### Parameters

| Name | Type | Description |
|---|---|---|
| spender | address | undefined |
| amount | uint256 | undefined |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | bool | undefined |

### balanceOf

```solidity
function balanceOf(address account) external view returns (uint256)
```



*Returns the amount of tokens owned by `account`.*

#### Parameters

| Name | Type | Description |
|---|---|---|
| account | address | undefined |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | uint256 | undefined |

### burn

```solidity
function burn(uint256 amount) external nonpayable
```

Burns user&#39;s tokens



#### Parameters

| Name | Type | Description |
|---|---|---|
| amount | uint256 | The amount of tokens to burn |

### checkAdmin

```solidity
function checkAdmin(address account) external view returns (bool)
```

Checks if user is an admin of this token



#### Parameters

| Name | Type | Description |
|---|---|---|
| account | address | The address to check |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | bool | True if user has admin token. Otherwise - false. |

### decimals

```solidity
function decimals() external view returns (uint8)
```

Returns number of decimals of the token




#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | uint8 | The number of decimals of the token |

### holders

```solidity
function holders() external view returns (address[])
```

Returns the array of addresses of all token holders




#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | address[] | The array of addresses of all token holders |

### isHolder

```solidity
function isHolder(address account) external view returns (bool)
```

Checks if the address is a holder



#### Parameters

| Name | Type | Description |
|---|---|---|
| account | address | The address to check |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | bool | True if address is a holder. False if it is not |

### maxTotalSupply

```solidity
function maxTotalSupply() external view returns (uint256)
```

Returns the max total supply of the token




#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | uint256 | The max total supply of the token |

### mint

```solidity
function mint(address to, uint256 amount) external nonpayable
```

Creates tokens and assigns them to account, increasing the total supply.

*Can only be called by the owner of the admin NFTCan only be called when token is mintable*

#### Parameters

| Name | Type | Description |
|---|---|---|
| to | address | The receiver of tokens |
| amount | uint256 | The amount of tokens to mint |

### mintable

```solidity
function mintable() external view returns (bool)
```

Indicates whether the token is mintable or not




#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | bool | True if the token is mintable. False - if it is not |

### name

```solidity
function name() external view returns (string)
```

Returns the name of the token




#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | string | The name of the token |

### symbol

```solidity
function symbol() external view returns (string)
```

Returns the symbol of the token




#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | string | The symbol of the token |

### totalSupply

```solidity
function totalSupply() external view returns (uint256)
```



*Returns the amount of tokens in existence.*


#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | uint256 | undefined |

### transfer

```solidity
function transfer(address to, uint256 amount) external nonpayable returns (bool)
```



*Moves `amount` tokens from the caller&#39;s account to `to`. Returns a boolean value indicating whether the operation succeeded. Emits a {Transfer} event.*

#### Parameters

| Name | Type | Description |
|---|---|---|
| to | address | undefined |
| amount | uint256 | undefined |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | bool | undefined |

### transferFrom

```solidity
function transferFrom(address from, address to, uint256 amount) external nonpayable returns (bool)
```



*Moves `amount` tokens from `from` to `to` using the allowance mechanism. `amount` is then deducted from the caller&#39;s allowance. Returns a boolean value indicating whether the operation succeeded. Emits a {Transfer} event.*

#### Parameters

| Name | Type | Description |
|---|---|---|
| from | address | undefined |
| to | address | undefined |
| amount | uint256 | undefined |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | bool | undefined |



## Events

### Approval

```solidity
event Approval(address indexed owner, address indexed spender, uint256 value)
```





#### Parameters

| Name | Type | Description |
|---|---|---|
| owner `indexed` | address | undefined |
| spender `indexed` | address | undefined |
| value  | uint256 | undefined |

### ControlledTokenBurnt

```solidity
event ControlledTokenBurnt(address indexed account, uint256 amount)
```

Indicates that a new ERC20 was burnt



#### Parameters

| Name | Type | Description |
|---|---|---|
| account `indexed` | address | undefined |
| amount  | uint256 | undefined |

### ControlledTokenCreated

```solidity
event ControlledTokenCreated(address indexed account, uint256 amount)
```

Indicates that a new ERC20 was created



#### Parameters

| Name | Type | Description |
|---|---|---|
| account `indexed` | address | undefined |
| amount  | uint256 | undefined |

### ControlledTokenTransferred

```solidity
event ControlledTokenTransferred(address indexed from, address indexed to, uint256 amount)
```

Indicates that a new ERC20 was transferred



#### Parameters

| Name | Type | Description |
|---|---|---|
| from `indexed` | address | undefined |
| to `indexed` | address | undefined |
| amount  | uint256 | undefined |

### Transfer

```solidity
event Transfer(address indexed from, address indexed to, uint256 value)
```





#### Parameters

| Name | Type | Description |
|---|---|---|
| from `indexed` | address | undefined |
| to `indexed` | address | undefined |
| value  | uint256 | undefined |



## Errors

### DeletingHolderFailed

```solidity
error DeletingHolderFailed()
```






### EmptyTokenDecimals

```solidity
error EmptyTokenDecimals()
```






### EmptyTokenName

```solidity
error EmptyTokenName()
```






### EmptyTokenSymbol

```solidity
error EmptyTokenSymbol()
```






### InvalidAdminTokenAddress

```solidity
error InvalidAdminTokenAddress()
```






### InvalidBurnAmount

```solidity
error InvalidBurnAmount()
```






### InvalidUserAddress

```solidity
error InvalidUserAddress()
```






### NoTokensToBurn

```solidity
error NoTokensToBurn()
```






### NoTokensToTransfer

```solidity
error NoTokensToTransfer()
```






### NotZeroMaxTotalSupply

```solidity
error NotZeroMaxTotalSupply()
```






### SenderCanNotBeAReceiver

```solidity
error SenderCanNotBeAReceiver()
```






### SupplyExceedsMaximumSupply

```solidity
error SupplyExceedsMaximumSupply()
```






### TheTokenIsNotMintable

```solidity
error TheTokenIsNotMintable()
```






### UserDoesNotHaveAnAdminToken

```solidity
error UserDoesNotHaveAnAdminToken()
```







