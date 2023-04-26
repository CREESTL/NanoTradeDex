# IBentureDex









## Methods

### buyLimit

```solidity
function buyLimit(address tokenA, address tokenB, uint256 amount, uint256 limitPrice) external payable
```

Creates an buy limit order



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | The address of the token that is purchased |
| tokenB | address | The address of the token that is sold |
| amount | uint256 | The amount of active tokens |
| limitPrice | uint256 | The limit price of the order in quoted tokens |

### buyMarket

```solidity
function buyMarket(address tokenA, address tokenB, uint256 amount, uint256 slippage, uint256 nonce, bytes signature) external payable
```

Creates a buy market order

*Cannot create the first order of the orderbook*

#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | The address of the token that is purchased |
| tokenB | address | The address of the token that is sold |
| amount | uint256 | The amount of active tokens |
| slippage | uint256 | Allowed price slippage (in basis points) |
| nonce | uint256 | A unique integer for each tx call |
| signature | bytes | The signature used to sign the hash of the message |

### cancelOrder

```solidity
function cancelOrder(uint256 id) external nonpayable
```

Cancels the limit order with the given ID.         Only limit orders can be cancelled



#### Parameters

| Name | Type | Description |
|---|---|---|
| id | uint256 | The ID of the limit order to cancel |

### checkMatched

```solidity
function checkMatched(uint256 firstId, uint256 secondId) external view returns (bool)
```

Checks if orders have matched any time before



#### Parameters

| Name | Type | Description |
|---|---|---|
| firstId | uint256 | The ID of the first order to check |
| secondId | uint256 | The ID of the second order to check |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | bool | True if orders matched. Otherwise - false |

### checkOrderExists

```solidity
function checkOrderExists(uint256 id) external view returns (bool)
```

Checks that order with the given ID exists



#### Parameters

| Name | Type | Description |
|---|---|---|
| id | uint256 | The ID to search for |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | bool | True if order with the given ID exists. Otherwise - false |

### checkPairExists

```solidity
function checkPairExists(address tokenA, address tokenB) external view returns (bool)
```

Checks if pair of provided tokens exists



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | The address of the first token |
| tokenB | address | The address of the second token |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | bool | True if pair exists.Otherwise - false |

### getLockAmount

```solidity
function getLockAmount(address tokenA, address tokenB, uint256 amount, uint256 limitPrice, enum IBentureDex.OrderType type_, enum IBentureDex.OrderSide side) external view returns (uint256)
```

Returns the amount necessary to lock to create an order



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | The address of the token that is purchased |
| tokenB | address | The address of the token that is sold |
| amount | uint256 | The amount of bought/sold tokens |
| limitPrice | uint256 | The limit price of the order. Zero for market orders |
| type_ | enum IBentureDex.OrderType | The type of the order |
| side | enum IBentureDex.OrderSide | The side of the order |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | uint256 | undefined |

### getOrder

```solidity
function getOrder(uint256 _id) external view returns (address, address, address, uint256, uint256, enum IBentureDex.OrderType, enum IBentureDex.OrderSide, uint256, bool, uint256, uint256, enum IBentureDex.OrderStatus)
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
| _3 | uint256 | The initial amount of active tokens |
| _4 | uint256 | The current increasing amount of active tokens |
| _5 | enum IBentureDex.OrderType | The type of the order |
| _6 | enum IBentureDex.OrderSide | The side of the order |
| _7 | uint256 | The limit price of the order in quoted tokens |
| _8 | bool | True if order is cancellable. Otherwise - false |
| _9 | uint256 | The fee paid for order creation |
| _10 | uint256 | The locked amount of tokens |
| _11 | enum IBentureDex.OrderStatus | The current status of the order |

### getOrdersByTokens

```solidity
function getOrdersByTokens(address tokenA, address tokenB) external view returns (uint256[])
```

Returns the lisf of IDs of orders containing given tokens



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | The address of the token that is purchased |
| tokenB | address | The address of the token that is sold |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | uint256[] | The list of IDs of orders containing given tokens |

### getPrice

```solidity
function getPrice(address tokenA, address tokenB) external view returns (address, uint256)
```

Returns the price of the pair of tokens



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | The address of the first token of the pair |
| tokenB | address | The address of the second token of the pair |

#### Returns

| Name | Type | Description |
|---|---|---|
| _0 | address | The quoted token of the pair |
| _1 | uint256 | The price of the pair in quoted tokens |

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
function matchOrders(uint256 initId, uint256[] matchedIds, uint256 nonce, bytes signature) external nonpayable
```

Executes matched orders

*Sum of locked amounts of `matchedIds` is always less than or      equal to the*

#### Parameters

| Name | Type | Description |
|---|---|---|
| initId | uint256 | The ID of the market/limit order |
| matchedIds | uint256[] | The list of IDs of limit orders |
| nonce | uint256 | A unique integer for each tx call |
| signature | bytes | The signature used to sign the hash of the message |

### sellLimit

```solidity
function sellLimit(address tokenA, address tokenB, uint256 amount, uint256 limitPrice) external payable
```

Creates an sell limit order



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | The address of the token that is purchased |
| tokenB | address | The address of the token that is sold |
| amount | uint256 | The amount of active tokens |
| limitPrice | uint256 | The limit price of the order in quoted tokens |

### sellMarket

```solidity
function sellMarket(address tokenA, address tokenB, uint256 amount, uint256 slippage, uint256 nonce, bytes signature) external payable
```

Creates a sell market order

*Cannot create the first order of the orderbook*

#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | The address of the token that is purchased |
| tokenB | address | The address of the token that is sold |
| amount | uint256 | The amount of active tokens |
| slippage | uint256 | Allowed price slippage (in basis points) |
| nonce | uint256 | A unique integer for each tx call |
| signature | bytes | The signature used to sign the hash of the message |

### setAdminToken

```solidity
function setAdminToken(address token) external nonpayable
```

Sets address of the admin token



#### Parameters

| Name | Type | Description |
|---|---|---|
| token | address | The address of the admin token |

### setBackend

```solidity
function setBackend(address acc) external nonpayable
```

Sets the address of the backend account

*This function should be called right after contract deploy.      Otherwise, order creation/cancelling/matching will not work.*

#### Parameters

| Name | Type | Description |
|---|---|---|
| acc | address | The address of the backend account |

### setFee

```solidity
function setFee(uint256 newFeeRate) external nonpayable
```

Sets a new fee rate



#### Parameters

| Name | Type | Description |
|---|---|---|
| newFeeRate | uint256 | A new fee rate |

### startSaleMultiple

```solidity
function startSaleMultiple(address tokenA, address tokenB, uint256[] amounts, uint256[] prices) external payable
```

Starts a multiple series sale of project tokens



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | The address of the token that is received |
| tokenB | address | The address of the token that is sold |
| amounts | uint256[] | The list of amounts of sold tokens. One for each series |
| prices | uint256[] | The list of prices of sold tokens. One for each series |

### startSaleSingle

```solidity
function startSaleSingle(address tokenA, address tokenB, uint256 amount, uint256 price) external payable
```

Starts a single series sale of project tokens



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA | address | The address of the token that is received |
| tokenB | address | The address of the token that is sold |
| amount | uint256 | The amount of sold tokens |
| price | uint256 | The limit price of the order in quoted tokens |

### withdrawAllFees

```solidity
function withdrawAllFees() external nonpayable
```

Withdraws all fees accumulated by creation of orders




### withdrawFees

```solidity
function withdrawFees(address[] tokens) external nonpayable
```

Withdraws fees accumulated by creation of specified orders



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokens | address[] | The list of addresses of active tokens of the order |



## Events

### AdminTokenChanged

```solidity
event AdminTokenChanged(address oldAdminToken, address newAdminToken)
```

Indicates that admin token address was changed



#### Parameters

| Name | Type | Description |
|---|---|---|
| oldAdminToken  | address | The address of the old admin token |
| newAdminToken  | address | The address of the new admin token |

### BackendChanged

```solidity
event BackendChanged(address oldAcc, address newAcc)
```

Indicates that backend address was changed



#### Parameters

| Name | Type | Description |
|---|---|---|
| oldAcc  | address | The address of the old backend account |
| newAcc  | address | The address of the new backend account |

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

### FeesWithdrawn

```solidity
event FeesWithdrawn(address token, uint256 amount)
```

Indicates that fees collected with one token were withdrawn



#### Parameters

| Name | Type | Description |
|---|---|---|
| token  | address | The address of the token in which fees were collected |
| amount  | uint256 | The amount of fees withdrawn |

### GasLimitReached

```solidity
event GasLimitReached(uint256 gasLeft, uint256 gasLimit)
```



*Indicates that 2/3 of block gas limit was spent during the      iteration inside the contract method*

#### Parameters

| Name | Type | Description |
|---|---|---|
| gasLeft  | uint256 | How much gas was used |
| gasLimit  | uint256 | The block gas limit |

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
| id  | uint256 | The ID of the order |
| user  | address | The creator of the order |
| tokenA  | address | The address of the token that is purchased |
| tokenB  | address | The address of the token that is sold |
| amount  | uint256 | The amount of active tokens |
| type_  | enum IBentureDex.OrderType | The type of the order |
| side  | enum IBentureDex.OrderSide | The side of the order |
| limitPrice  | uint256 | The limit price of the order in quoted tokens |
| isCancellable  | bool | True if order is cancellable. Otherwise - false |

### OrdersMatched

```solidity
event OrdersMatched(uint256 initId, uint256 matchedId)
```

Indicates that orders were matched



#### Parameters

| Name | Type | Description |
|---|---|---|
| initId  | uint256 | The ID of first matched order |
| matchedId  | uint256 | The ID of the second matched order |

### PriceChanged

```solidity
event PriceChanged(address tokenA, address tokenB, uint256 newPrice)
```

Indicates that price of the pair was changed



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA  | address | The address of the first token of the pair |
| tokenB  | address | The address of the second token of the pair |
| newPrice  | uint256 | The new price of the pair in quoted tokens |

### SaleStarted

```solidity
event SaleStarted(address tokenA, address tokenB, uint256 amount, uint256 price)
```

Indicates that a single series sale has started



#### Parameters

| Name | Type | Description |
|---|---|---|
| tokenA  | address | The purchased token |
| tokenB  | address | The sold token |
| amount  | uint256 | The amount of sold tokens |
| price  | uint256 | The price at which the sell is made |



## Errors

### AdminTokenNotSet

```solidity
error AdminTokenNotSet()
```






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







