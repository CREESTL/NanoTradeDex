# OrderController



> Contract that controlls creation and execution of market and limit orders





## Methods

### backendAcc

```solidity
function backendAcc() external view returns (address)
```

The address of the backend account




#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | address | undefined |

### cancelOrder

```solidity
function cancelOrder(uint256 id, uint256 nonce, bytes signature) external nonpayable
```

See {IOrderController-cancelOrder}



#### Parameters

| Name | Type | Description |
|---|---|---|
| id | uint256 | undefined |
| nonce | uint256 | undefined |
| signature | bytes | undefined |

### checkMatched

```solidity
function checkMatched(uint256 firstId, uint256 secondId) external view returns (bool)
```

See (IOrderController-checkMatched)



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

See {IOrderController-checkOrderExists}



#### Parameters

| Name | Type | Description |
|---|---|---|
| id | uint256 | undefined |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | bool | undefined |

### createOrder

```solidity
function createOrder(address tokenA, address tokenB, uint256 amount, enum IOrderController.OrderType type_, enum IOrderController.OrderSide side, uint256 limitPrice, uint256 slippage, bool isCancellable, uint256 nonce, bytes signature) external nonpayable
```

See {IOrderController-createOrder}



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | undefined |
| tokenB | address | undefined |
| amount | uint256 | undefined |
| type_ | enum IOrderController.OrderType | undefined |
| side | enum IOrderController.OrderSide | undefined |
| limitPrice | uint256 | undefined |
| slippage | uint256 | undefined |
| isCancellable | bool | undefined |
| nonce | uint256 | undefined |
| signature | bytes | undefined |

### executed

```solidity
function executed(bytes32) external view returns (bool)
```

Marks transaction hashes that have been executed already.         Prevents Replay Attacks



#### Parameters

| Name | Type | Description |
|---|---|---|
| _0 | bytes32 | undefined |

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

### getOrder

```solidity
function getOrder(uint256 _id) external view returns (address, address, address, uint256, uint256, enum IOrderController.OrderType, enum IOrderController.OrderSide, uint256, bool, enum IOrderController.OrderStatus)
```

See {IOrderController-getOrder}



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
| _5 | enum IOrderController.OrderType | undefined |
| _6 | enum IOrderController.OrderSide | undefined |
| _7 | uint256 | undefined |
| _8 | bool | undefined |
| _9 | enum IOrderController.OrderStatus | undefined |

### getOrdersByTokens

```solidity
function getOrdersByTokens(address tokenA, address tokenB) external view returns (uint256[])
```

See {IOrderController-getOrdersByTokens}



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | undefined |
| tokenB | address | undefined |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | uint256[] | undefined |

### getTxHash

```solidity
function getTxHash(uint256 nonce) external view returns (bytes32)
```



*Calculates the hash of the transaction with nonce and contract address*

#### Parameters

| Name | Type | Description |
|---|---|---|
| nonce | uint256 | The unique integer |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | bytes32 | undefined |

### getUserOrders

```solidity
function getUserOrders(address user) external view returns (uint256[])
```

See {IOrderController-getUserOrders}



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

See {IOrderController-matchOrders}



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


### setBackend

```solidity
function setBackend(address acc) external nonpayable
```

See {IOrderController-setBackend}



#### Parameters

| Name | Type | Description |
|---|---|---|
| acc | address | undefined |

### setFee

```solidity
function setFee(uint256 newFeeRate) external nonpayable
```

See {IOrderController-setFee}



#### Parameters

| Name | Type | Description |
|---|---|---|
| newFeeRate | uint256 | undefined |

### startSaleMultiple

```solidity
function startSaleMultiple(address tokenA, address tokenB, uint256[] amounts, uint256[] prices, uint256 nonce, bytes signature) external nonpayable
```

See {IOrderController-startSaleMultiple}



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | undefined |
| tokenB | address | undefined |
| amounts | uint256[] | undefined |
| prices | uint256[] | undefined |
| nonce | uint256 | undefined |
| signature | bytes | undefined |

### startSaleSingle

```solidity
function startSaleSingle(address tokenA, address tokenB, uint256 amount, uint256 price, uint256 nonce, bytes signature) external nonpayable
```

See {IOrderController-startSaleSingle}



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | undefined |
| tokenB | address | undefined |
| amount | uint256 | undefined |
| price | uint256 | undefined |
| nonce | uint256 | undefined |
| signature | bytes | undefined |

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

See {IOrderController-withdrawAllFees}




### withdrawFees

```solidity
function withdrawFees(address[] tokens) external nonpayable
```

See {IOrderController-withdrawFees}



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
event OrderCreated(uint256 indexed id, address user, address indexed tokenA, address indexed tokenB, uint256 amount, enum IOrderController.OrderType type_, enum IOrderController.OrderSide side, uint256 limitPrice, bool isCancellable)
```

Indicates that a new order has been created.



#### Parameters

| Name | Type | Description |
|---|---|---|
| id `indexed` | uint256 | undefined |
| user  | address | undefined |
| tokenA `indexed` | address | undefined |
| tokenB `indexed` | address | undefined |
| amount  | uint256 | undefined |
| type_  | enum IOrderController.OrderType | undefined |
| side  | enum IOrderController.OrderSide | undefined |
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
event SaleStarted(address token)
```

Indicates that a single series sale has started



#### Parameters

| Name | Type | Description |
|---|---|---|
| token  | address | undefined |



## Errors

### SlippageTooBig

```solidity
error SlippageTooBig(uint256 slippage)
```

Indicates that price slippage was too big



#### Parameters

| Name | Type | Description |
|---|---|---|
| slippage | uint256 | The real slippage |


