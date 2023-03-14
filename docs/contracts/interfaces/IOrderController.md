# IOrderController









## Methods

### cancelOrder

```solidity
function cancelOrder(uint256 id) external nonpayable
```

Cancels the order with the given ID



#### Parameters

| Name | Type | Description |
|---|---|---|
| id | uint256 | The ID of the order to cancel |

### createOrder

```solidity
function createOrder(address tokenA, address tokenB, uint256 amountA, uint256 amountB, enum IOrderController.OrderType type_, enum IOrderController.OrderSide side, uint256 limit, bool isCancellable) external nonpayable
```

Creates an order with specified parameters



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | The address of the token that is purchased |
| tokenB | address | The address of the token that is sold |
| amountA | uint256 | The amount of purchased tokens |
| amountB | uint256 | The amount of sold tokens |
| type_ | enum IOrderController.OrderType | The type of the order |
| side | enum IOrderController.OrderSide | The side of the order |
| limit | uint256 | The limit amount of the order (for limit orders only) |
| isCancellable | bool | True if order is cancellable. Otherwise - false |

### getOrder

```solidity
function getOrder(uint256 _id) external view returns (address, address, address, uint256, uint256, uint256, enum IOrderController.OrderType, enum IOrderController.OrderSide, uint256, bool, enum IOrderController.OrderStatus)
```

Returns information about the given order



#### Parameters

| Name | Type | Description |
|---|---|---|
| _id | uint256 | The ID of the order to search |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | address | The creator of the order |
| _1 | address | The address of the token that is purchased |
| _2 | address | The address of the token that is sold |
| _3 | uint256 | The amount of purchased tokens |
| _4 | uint256 | The amount of sold tokens |
| _5 | uint256 | The amount of tokens left for order to be closed |
| _6 | enum IOrderController.OrderType | The type of the order |
| _7 | enum IOrderController.OrderSide | The side of the order |
| _8 | uint256 | The limit amount of the order (for limit orders only) |
| _9 | bool | True if order is cancellable. Otherwise - false |
| _10 | enum IOrderController.OrderStatus | The current status of the order |

### getUserOrders

```solidity
function getUserOrders(address user) external view returns (uint256[])
```

Returns the list of IDs of orders user has created



#### Parameters

| Name | Type | Description |
|---|---|---|
| user | address | The address of the user |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | uint256[] | The list of IDs of orders user has created |

### matchOrders

```solidity
function matchOrders(uint256[] matchedOrderIds, address tokenA, address tokenB, uint256 amountA, uint256 amountB, bool isMarket) external nonpayable
```

Executes matched orders



#### Parameters

| Name | Type | Description |
|---|---|---|
| matchedOrderIds | uint256[] | The list of IDs of matched orders |
| tokenA | address | The address of the token that is purchased |
| tokenB | address | The address of the token that is sold |
| amountA | uint256 | The amount of purchased tokens |
| amountB | uint256 | The amount of sold tokens |
| isMarket | bool | undefined |

### setFee

```solidity
function setFee(uint256 newFeeRate) external nonpayable
```

Sets a new fee rate



#### Parameters

| Name | Type | Description |
|---|---|---|
| newFeeRate | uint256 | A new fee rate |

### withdrawFee

```solidity
function withdrawFee(address token) external nonpayable
```

Withdraws fees accumulated by orders of one token



#### Parameters

| Name | Type | Description |
|---|---|---|
| token | address | The address of the token to withdraw fees of |



## Events

### FeeRateChanged

```solidity
event FeeRateChanged(uint256 oldFeeRate, uint256 newFeeRate)
```

Indicates that order fee rate was changed



#### Parameters

| Name | Type | Description |
|---|---|---|
| oldFeeRate  | uint256 | The old fee rate |
| newFeeRate  | uint256 | The new set fee rate |

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

*No need to pass all order fields here. It&#39;s easier to use getter by ID*

#### Parameters

| Name | Type | Description |
|---|---|---|
| id `indexed` | uint256 | The ID of the created order |

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



