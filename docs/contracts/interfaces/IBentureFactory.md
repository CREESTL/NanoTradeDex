# IBentureFactory



> An interface of a factory of custom ERC20 tokens





## Methods

### createERC20Token

```solidity
function createERC20Token(string name, string symbol, uint8 decimals, bool mintable, uint256 maxTotalSupply, address adminToken_) external nonpayable
```

Creates a new ERC20 token and mints an admin token proving ownership

*Anyone can call this method. No restrictions.*

#### Parameters

| Name | Type | Description |
|---|---|---|
| name | string | The name of the token |
| symbol | string | The symbol of the token |
| decimals | uint8 | Number of decimals of the token |
| mintable | bool | Token may be either mintable or not. Can be changed later. |
| maxTotalSupply | uint256 | Maximum amount of tokens to be minted |
| adminToken_ | address | Address of the admin token for controlled token |

### lastProducedToken

```solidity
function lastProducedToken() external view returns (address)
```

Returns the address of the produced ERC20 token




#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | address | The address of the produced ERC20 token |



## Events

### CreateERC20Token

```solidity
event CreateERC20Token(string indexed name, string indexed symbol, address indexed tokenAddress, uint8 decimals, bool mintable)
```



*Indicates that a new ERC20 token was created*

#### Parameters

| Name | Type | Description |
|---|---|---|
| name `indexed` | string | undefined |
| symbol `indexed` | string | undefined |
| tokenAddress `indexed` | address | undefined |
| decimals  | uint8 | undefined |
| mintable  | bool | undefined |



## Errors

### BentureAddressIsZero

```solidity
error BentureAddressIsZero()
```







