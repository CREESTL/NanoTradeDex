# IBentureAdmin



> An interface of a factory of custom ERC20 tokens;





## Methods

### burn

```solidity
function burn(uint256 tokenId) external nonpayable
```

Burns the token with the provided ID



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenId | uint256 | The ID of the token to burn |

### checkAdminOfAny

```solidity
function checkAdminOfAny(address user) external view returns (bool)
```

Checks if the provided user is an admin of any project



#### Parameters

| Name | Type | Description |
|---|---|---|
| user | address | The address of the user to check |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | bool | True if user is admin of any project. Otherwise - false |

### checkAdminOfProject

```solidity
function checkAdminOfProject(address user, address ERC20Address) external view returns (bool)
```

Checks if the provided user owns an admin token controlling the provided ERC20 token



#### Parameters

| Name | Type | Description |
|---|---|---|
| user | address | The address of the user that potentially controls ERC20 token |
| ERC20Address | address | The address of the potentially controlled ERC20 token |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | bool | True if user has admin token. Otherwise - false. |

### checkOwner

```solidity
function checkOwner(address user) external view
```

Checks it the provided address owns any admin token



#### Parameters

| Name | Type | Description |
|---|---|---|
| user | address | undefined |

### getAdminTokenIds

```solidity
function getAdminTokenIds(address admin) external view returns (uint256[])
```

Returns the list of all admin tokens of the user



#### Parameters

| Name | Type | Description |
|---|---|---|
| admin | address | The address of the admin |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | uint256[] | undefined |

### getControlledAddressById

```solidity
function getControlledAddressById(uint256 tokenId) external view returns (address)
```

Returns the address of the controlled ERC20 token



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenId | uint256 | The ID of ERC721 token to check |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | address | The address of the controlled ERC20 token |

### getFactory

```solidity
function getFactory() external view returns (address)
```

Returns the address of the factory that mints admin tokens




#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | address | The address of the factory |

### mintWithERC20Address

```solidity
function mintWithERC20Address(address to, address ERC20Address) external nonpayable
```

Mints a new ERC721 token with the address of the controlled ERC20 token



#### Parameters

| Name | Type | Description |
|---|---|---|
| to | address | The address of the receiver of the token |
| ERC20Address | address | The address of the controlled ERC20 token |



## Events

### AdminTokenBurnt

```solidity
event AdminTokenBurnt(uint256 tokenId)
```



*Indicates that an ERC721 token got burnt*

#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenId  | uint256 | undefined |

### AdminTokenCreated

```solidity
event AdminTokenCreated(uint256 tokenId, address ERC20Address)
```



*Indicates that a new ERC721 token got minted*

#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenId  | uint256 | undefined |
| ERC20Address  | address | undefined |

### AdminTokenTransferred

```solidity
event AdminTokenTransferred(address from, address to, uint256 tokenId)
```



*Indicates that an ERC721 token got transferred*

#### Parameters

| Name | Type | Description |
|---|---|---|
| from  | address | undefined |
| to  | address | undefined |
| tokenId  | uint256 | undefined |



## Errors

### CallerIsNotAFactory

```solidity
error CallerIsNotAFactory()
```






### FailedToDeleteTokenID

```solidity
error FailedToDeleteTokenID()
```






### InvalidAdminAddress

```solidity
error InvalidAdminAddress()
```






### InvalidFactoryAddress

```solidity
error InvalidFactoryAddress()
```






### InvalidTokenAddress

```solidity
error InvalidTokenAddress()
```






### InvalidUserAddress

```solidity
error InvalidUserAddress()
```






### MintToZeroAddressNotAllowed

```solidity
error MintToZeroAddressNotAllowed()
```






### NoControlledToken

```solidity
error NoControlledToken()
```






### NotAnOwner

```solidity
error NotAnOwner()
```






### OnlyOneAdminTokenForProjectToken

```solidity
error OnlyOneAdminTokenForProjectToken()
```






### UserDoesNotHaveAnAdminToken

```solidity
error UserDoesNotHaveAnAdminToken()
```







