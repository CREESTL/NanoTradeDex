# OrderController



> Contract that controlls creation and execution of market and limit orders





## Methods

### cancelOrder

```solidity
function cancelOrder(uint256 id) external nonpayable
```

See {IOrderController-cancelOrder}



#### Parameters

| Name | Type | Description |
|---|---|---|
| id | uint256 | undefined |

### createOrder

```solidity
function createOrder(address tokenA, address tokenB, uint256 amountA, uint256 amountB, enum IOrderController.OrderType type_, enum IOrderController.OrderSide side, uint256 limit, bool isCancellable) external nonpayable
```

See {IOrderController-createOrder}



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | undefined |
| tokenB | address | undefined |
| amountA | uint256 | undefined |
| amountB | uint256 | undefined |
| type_ | enum IOrderController.OrderType | undefined |
| side | enum IOrderController.OrderSide | undefined |
| limit | uint256 | undefined |
| isCancellable | bool | undefined |

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
function getOrder(uint256 _id) external view returns (address, address, address, uint256, uint256, uint256, enum IOrderController.OrderType, enum IOrderController.OrderSide, uint256, bool, enum IOrderController.OrderStatus)
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
| _5 | uint256 | undefined |
| _6 | enum IOrderController.OrderType | undefined |
| _7 | enum IOrderController.OrderSide | undefined |
| _8 | uint256 | undefined |
| _9 | bool | undefined |
| _10 | enum IOrderController.OrderStatus | undefined |

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
function matchOrders(uint256[] matchedOrderIds, address tokenA, address tokenB, uint256 amountA, uint256 amountB, bool isMarket) external nonpayable
```

See {IOrderController-matchOrders}



#### Parameters

| Name | Type | Description |
|---|---|---|
| matchedOrderIds | uint256[] | undefined |
| tokenA | address | undefined |
| tokenB | address | undefined |
| amountA | uint256 | undefined |
| amountB | uint256 | undefined |
| isMarket | bool | undefined |

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


### setFee

```solidity
function setFee(uint256 newFeeRate) external nonpayable
```

See {IOrderController-setFee}



#### Parameters

| Name | Type | Description |
|---|---|---|
| newFeeRate | uint256 | undefined |

### transferOwnership

```solidity
function transferOwnership(address newOwner) external nonpayable
```



*Transfers ownership of the contract to a new account (`newOwner`). Can only be called by the current owner.*

#### Parameters

| Name | Type | Description |
|---|---|---|
| newOwner | address | undefined |

### withdrawFee

```solidity
function withdrawFee(address token) external nonpayable
```

See {IOrderController-withdrawFee}



#### Parameters

| Name | Type | Description |
|---|---|---|
| token | address | undefined |



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
event OrderCreated(uint256 indexed id)
```

Indicates that a new order has been created.



#### Parameters

| Name | Type | Description |
|---|---|---|
| id `indexed` | uint256 | undefined |

### OrderMatched

```solidity
event OrderMatched(uint256 id, uint256 matchedId, uint256 amountReceived, uint256 amountPaid, uint256 amountLeftToFill, uint256 fee, uint256 feeRate)
```

Indicates that two orders have matched



#### Parameters

| Name | Type | Description |
|---|---|---|
| id  | uint256 | undefined |
| matchedId  | uint256 | undefined |
| amountReceived  | uint256 | undefined |
| amountPaid  | uint256 | undefined |
| amountLeftToFill  | uint256 | undefined |
| fee  | uint256 | undefined |
| feeRate  | uint256 | undefined |

### OwnershipTransferred

```solidity
event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)
```





#### Parameters

| Name | Type | Description |
|---|---|---|
| previousOwner `indexed` | address | undefined |
| newOwner `indexed` | address | undefined |



