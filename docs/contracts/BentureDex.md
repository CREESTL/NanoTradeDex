# BentureDex



> Contract that controlls creation and execution of market and limit orders





## Methods

### _getTxHashMarket

```solidity
function _getTxHashMarket(address tokenA, address tokenB, uint256 amount, uint256 slippage, uint256 nonce) external view returns (bytes32)
```



*Calculates the hash of parameters of market order function and a nonceNOTICE: Backend must form tx hash exactly the same way*

#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | The address of the purchased token |
| tokenB | address | The address of the sold token |
| amount | uint256 | The amound of purchased / sold tokens |
| slippage | uint256 | The maximum allowed price slippage |
| nonce | uint256 | The unique integer |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | bytes32 | undefined |

### _getTxHashMatch

```solidity
function _getTxHashMatch(uint256 initId, uint256[] matchedIds, uint256 nonce) external view returns (bytes32)
```



*Calculates the hash of parameters of order matching function and a nonceNOTICE: Backend must form tx hash exactly the same way*

#### Parameters

| Name | Type | Description |
|---|---|---|
| initId | uint256 | The ID of first matched order |
| matchedIds | uint256[] | The list of IDs of other matched orders |
| nonce | uint256 | The unique integer |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | bytes32 | undefined |

### backendAcc

```solidity
function backendAcc() external view returns (address)
```

The address of the backend account




#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | address | undefined |

### buyLimit

```solidity
function buyLimit(address tokenA, address tokenB, uint256 amount, uint256 limitPrice) external payable
```

See {IBentureDex-buyLimit}



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | undefined |
| tokenB | address | undefined |
| amount | uint256 | undefined |
| limitPrice | uint256 | undefined |

### buyMarket

```solidity
function buyMarket(address tokenA, address tokenB, uint256 amount, uint256 slippage, uint256 nonce, bytes signature) external payable
```

See {IBentureDex-buyMarket}



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | undefined |
| tokenB | address | undefined |
| amount | uint256 | undefined |
| slippage | uint256 | undefined |
| nonce | uint256 | undefined |
| signature | bytes | undefined |

### cancelOrder

```solidity
function cancelOrder(uint256 id) external nonpayable
```

See {IBentureDex-cancelOrder}



#### Parameters

| Name | Type | Description |
|---|---|---|
| id | uint256 | undefined |

### checkMatched

```solidity
function checkMatched(uint256 firstId, uint256 secondId) external view returns (bool)
```

See (IBentureDex-checkMatched)



#### Parameters

| Name | Type | Description |
|---|---|---|
| firstId | uint256 | undefined |
| secondId | uint256 | undefined |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | bool | undefined |

### checkOrderExists

```solidity
function checkOrderExists(uint256 id) external view returns (bool)
```

See {IBentureDex-checkOrderExists}



#### Parameters

| Name | Type | Description |
|---|---|---|
| id | uint256 | undefined |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | bool | undefined |

### checkPairExists

```solidity
function checkPairExists(address tokenA, address tokenB) external view returns (bool)
```

See {IBentureDex-checkPairExists}



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | undefined |
| tokenB | address | undefined |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | bool | undefined |

### feeRate

```solidity
function feeRate() external view returns (uint256)
```

Percentage of each order being paid as fee (in basis points)




#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | uint256 | undefined |

### getLockAmount

```solidity
function getLockAmount(address tokenA, address tokenB, uint256 amount, uint256 limitPrice, enum IBentureDex.OrderType type_, enum IBentureDex.OrderSide side) external view returns (uint256 lockAmount)
```

See {IBentureDex-getLockAmount}



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | undefined |
| tokenB | address | undefined |
| amount | uint256 | undefined |
| limitPrice | uint256 | undefined |
| type_ | enum IBentureDex.OrderType | undefined |
| side | enum IBentureDex.OrderSide | undefined |

#### Returns

| Name | Type | Description |
|---|---|---|
| lockAmount | uint256 | undefined |

### getOrder

```solidity
function getOrder(uint256 _id) external view returns (address, address, address, uint256, uint256, enum IBentureDex.OrderType, enum IBentureDex.OrderSide, uint256, bool, uint256, uint256, enum IBentureDex.OrderStatus)
```

See {IBentureDex-getOrder}



#### Parameters

| Name | Type | Description |
|---|---|---|
| _id | uint256 | undefined |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | address | undefined |
| _1 | address | undefined |
| _2 | address | undefined |
| _3 | uint256 | undefined |
| _4 | uint256 | undefined |
| _5 | enum IBentureDex.OrderType | undefined |
| _6 | enum IBentureDex.OrderSide | undefined |
| _7 | uint256 | undefined |
| _8 | bool | undefined |
| _9 | uint256 | undefined |
| _10 | uint256 | undefined |
| _11 | enum IBentureDex.OrderStatus | undefined |

### getOrdersByTokens

```solidity
function getOrdersByTokens(address tokenA, address tokenB) external view returns (uint256[])
```

See {IBentureDex-getOrdersByTokens}



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | undefined |
| tokenB | address | undefined |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | uint256[] | undefined |

### getPrice

```solidity
function getPrice(address tokenA, address tokenB) external view returns (address, uint256)
```

See {IBentureDex-getPrice}



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | undefined |
| tokenB | address | undefined |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | address | undefined |
| _1 | uint256 | undefined |

### getUserOrders

```solidity
function getUserOrders(address user) external view returns (uint256[])
```

See {IBentureDex-getUserOrders}



#### Parameters

| Name | Type | Description |
|---|---|---|
| user | address | undefined |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | uint256[] | undefined |

### matchOrders

```solidity
function matchOrders(uint256 initId, uint256[] matchedIds, uint256 nonce, bytes signature) external nonpayable
```

See {IBentureDex-matchOrders}



#### Parameters

| Name | Type | Description |
|---|---|---|
| initId | uint256 | undefined |
| matchedIds | uint256[] | undefined |
| nonce | uint256 | undefined |
| signature | bytes | undefined |

### owner

```solidity
function owner() external view returns (address)
```



*Returns the address of the current owner.*


#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | address | undefined |

### renounceOwnership

```solidity
function renounceOwnership() external nonpayable
```



*Leaves the contract without owner. It will not be possible to call `onlyOwner` functions anymore. Can only be called by the current owner. NOTE: Renouncing ownership will leave the contract without an owner, thereby removing any functionality that is only available to the owner.*


### sellLimit

```solidity
function sellLimit(address tokenA, address tokenB, uint256 amount, uint256 limitPrice) external payable
```

See {IBentureDex-sellLimit}



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | undefined |
| tokenB | address | undefined |
| amount | uint256 | undefined |
| limitPrice | uint256 | undefined |

### sellMarket

```solidity
function sellMarket(address tokenA, address tokenB, uint256 amount, uint256 slippage, uint256 nonce, bytes signature) external payable
```

See {IBentureDex-sellMarket}



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | undefined |
| tokenB | address | undefined |
| amount | uint256 | undefined |
| slippage | uint256 | undefined |
| nonce | uint256 | undefined |
| signature | bytes | undefined |

### setBackend

```solidity
function setBackend(address acc) external nonpayable
```

See {IBentureDex-setBackend}



#### Parameters

| Name | Type | Description |
|---|---|---|
| acc | address | undefined |

### setFee

```solidity
function setFee(uint256 newFeeRate) external nonpayable
```

See {IBentureDex-setFee}



#### Parameters

| Name | Type | Description |
|---|---|---|
| newFeeRate | uint256 | undefined |

### startSaleMultiple

```solidity
function startSaleMultiple(address tokenA, address tokenB, uint256[] amounts, uint256[] prices) external payable
```

See {IBentureDex-startSaleMultiple}



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | undefined |
| tokenB | address | undefined |
| amounts | uint256[] | undefined |
| prices | uint256[] | undefined |

### startSaleSingle

```solidity
function startSaleSingle(address tokenA, address tokenB, uint256 amount, uint256 price) external payable
```

See {IBentureDex-startSaleSingle}



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | undefined |
| tokenB | address | undefined |
| amount | uint256 | undefined |
| price | uint256 | undefined |

### transferOwnership

```solidity
function transferOwnership(address newOwner) external nonpayable
```



*Transfers ownership of the contract to a new account (`newOwner`). Can only be called by the current owner.*

#### Parameters

| Name | Type | Description |
|---|---|---|
| newOwner | address | undefined |

### withdrawAllFees

```solidity
function withdrawAllFees() external nonpayable
```

See {IBentureDex-withdrawAllFees}




### withdrawFees

```solidity
function withdrawFees(address[] tokens) external nonpayable
```

See {IBentureDex-withdrawFees}



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokens | address[] | undefined |



## Events

### FeeRateChanged

```solidity
event FeeRateChanged(uint256 oldFeeRate, uint256 newFeeRate)
```

Indicates that order fee rate was changed



#### Parameters

| Name | Type | Description |
|---|---|---|
| oldFeeRate  | uint256 | undefined |
| newFeeRate  | uint256 | undefined |

### FeesWithdrawn

```solidity
event FeesWithdrawn(address token, uint256 amount)
```

Indicates that fees collected with one token were withdrawn



#### Parameters

| Name | Type | Description |
|---|---|---|
| token  | address | undefined |
| amount  | uint256 | undefined |

### GasLimitReached

```solidity
event GasLimitReached(uint256 gasLeft, uint256 gasLimit)
```





#### Parameters

| Name | Type | Description |
|---|---|---|
| gasLeft  | uint256 | undefined |
| gasLimit  | uint256 | undefined |

### OrderCancelled

```solidity
event OrderCancelled(uint256 id)
```

Indicates that the order was cancelled



#### Parameters

| Name | Type | Description |
|---|---|---|
| id  | uint256 | undefined |

### OrderCreated

```solidity
event OrderCreated(uint256 id, address user, address tokenA, address tokenB, uint256 amount, enum IBentureDex.OrderType type_, enum IBentureDex.OrderSide side, uint256 limitPrice, bool isCancellable)
```

Indicates that a new order has been created.



#### Parameters

| Name | Type | Description |
|---|---|---|
| id  | uint256 | undefined |
| user  | address | undefined |
| tokenA  | address | undefined |
| tokenB  | address | undefined |
| amount  | uint256 | undefined |
| type_  | enum IBentureDex.OrderType | undefined |
| side  | enum IBentureDex.OrderSide | undefined |
| limitPrice  | uint256 | undefined |
| isCancellable  | bool | undefined |

### OrdersMatched

```solidity
event OrdersMatched(uint256 initId, uint256 matchedId)
```

Indicates that orders were matched



#### Parameters

| Name | Type | Description |
|---|---|---|
| initId  | uint256 | undefined |
| matchedId  | uint256 | undefined |

### OwnershipTransferred

```solidity
event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)
```





#### Parameters

| Name | Type | Description |
|---|---|---|
| previousOwner `indexed` | address | undefined |
| newOwner `indexed` | address | undefined |

### PriceChanged

```solidity
event PriceChanged(address tokenA, address tokenB, uint256 newPrice)
```

Indicates that price of the pair was changed



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA  | address | undefined |
| tokenB  | address | undefined |
| newPrice  | uint256 | undefined |

### SaleStarted

```solidity
event SaleStarted(address tokenA, address tokenB, uint256 amount, uint256 price)
```

Indicates that a single series sale has started



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA  | address | undefined |
| tokenB  | address | undefined |
| amount  | uint256 | undefined |
| price  | uint256 | undefined |



## Errors

### DifferentLength

```solidity
error DifferentLength()
```






### InvalidFirstTokenAddress

```solidity
error InvalidFirstTokenAddress()
```






### InvalidOrderStatus

```solidity
error InvalidOrderStatus()
```






### InvalidPrice

```solidity
error InvalidPrice()
```






### InvalidSignature

```solidity
error InvalidSignature()
```






### NoFeesToWithdraw

```solidity
error NoFeesToWithdraw()
```






### NoQuotedTokens

```solidity
error NoQuotedTokens()
```






### NonCancellable

```solidity
error NonCancellable()
```






### NotAdmin

```solidity
error NotAdmin()
```






### NotEnoughNativeTokens

```solidity
error NotEnoughNativeTokens()
```






### NotOrderCreator

```solidity
error NotOrderCreator()
```






### OrderDoesNotExist

```solidity
error OrderDoesNotExist()
```






### PairNotCreated

```solidity
error PairNotCreated()
```






### SameBackend

```solidity
error SameBackend()
```






### SameFee

```solidity
error SameFee()
```






### SlippageTooBig

```solidity
error SlippageTooBig(uint256 slippage)
```





#### Parameters

| Name | Type | Description |
|---|---|---|
| slippage | uint256 | undefined |

### TransferFailed

```solidity
error TransferFailed()
```






### TxAlreadyExecuted

```solidity
error TxAlreadyExecuted(bytes32 txHash)
```





#### Parameters

| Name | Type | Description |
|---|---|---|
| txHash | bytes32 | undefined |

### ZeroAddress

```solidity
error ZeroAddress()
```






### ZeroAmount

```solidity
error ZeroAmount()
```






### ZeroPrice

```solidity
error ZeroPrice()
```







