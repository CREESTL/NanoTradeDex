// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";

interface IOrderController {
    /// @dev The type of the order (Market of Limit)
    enum OrderType {
        Market,
        Limit
    }

    /// @dev The status of the order
    /// @dev Active: created and waiting for matching
    ///      PartiallyClosed: only part of the order was matched and executed
    ///      Closed: the whole order was matched and executed
    ///      Cancelled: the whole order was cancelled
    enum OrderStatus {
        Active,
        PartiallyClosed,
        Closed,
        Cancelled
    }

    /// @dev The side of the order
    ///      Order side defines active tokens of the order
    enum OrderSide {
        Buy,
        Sell
    }

    /// @dev The structure of the single order
    struct Order {
        // The ID (number) of the order
        uint256 id;
        // The address which created an order
        address user;
        // The address of the tokens that is purchased
        address tokenA;
        // The address of the tokens that is sold
        address tokenB;
        // The initial amount of active tokens
        // Active tokens are defined by order side
        // If it's a "sell" order, then `tokenB` is active
        // If it's a "buy" order, then `tokenA` is active
        // This amount does not change during order execution
        uint256 amount;
        // The current amount of active tokens
        // Gets increased in any type of orders
        uint256 amountCurrent;
        // Order type (market or limit)
        OrderType type_;
        // Order side (buy or sell)
        OrderSide side;
        // Only for limit orders. Zero for market orders
        // Includes precision
        // Expressed in quoted tokens
        uint256 limitPrice;
        // Allowed price slippage in Basis Points
        uint256 slippage;
        // True if order can be cancelled, false - if not
        bool isCancellable;
        // Status
        OrderStatus status;
        // The amount of active tokens paid as fee
        uint256 feeAmount;
    }

    /// @dev Used to hold parameters for `_createOrder` internal function
    ///      to avoid `Stack Too Deep` error.
    struct OrderArgs {
        // The address of the tokens that is purchased
        address tokenA;
        // The address of the tokens that is sold
        address tokenB;
        // The initial amount of active tokens
        // Active tokens are defined by order side
        // If it's a "sell" order, then `tokenB` is active
        // If it's a "buy" order, then `tokenA` is active
        // This amount does not change during order execution
        uint256 amount;
        // The current amount of active tokens
        // Gets increased in any type of orders
        uint256 amountCurrent;
        // Order type (market or limit)
        OrderType type_;
        // Order side (buy or sell)
        OrderSide side;
        // Only for limit orders. Zero for market orders
        // Includes precision
        // Expressed in quoted tokens
        uint256 limitPrice;
        // Allowed price slippage in Basis Points
        uint256 slippage;
        // Amount of tokens locked ti pay for the order
        uint256 lockAmount;
        // Amount of tokens paid as fees for order creation
        uint256 feeAmount;
        // True if order can be cancelled, false - if not
        bool isCancellable;
    }

    /// @notice Indicates that a new order has been created.
    /// @param id The ID of the order
    /// @param user The creator of the order
    /// @param tokenA The address of the token that is purchased
    /// @param tokenB The address of the token that is sold
    /// @param amount The amount of active tokens
    /// @param type_ The type of the order
    /// @param side The side of the order
    /// @param limitPrice The limit price of the order in quoted tokens
    /// @param isCancellable True if order is cancellable. Otherwise - false
    event OrderCreated(
        uint256 indexed id,
        address user,
        address indexed tokenA,
        address indexed tokenB,
        uint256 amount,
        OrderType type_,
        OrderSide side,
        uint256 limitPrice,
        bool isCancellable
    );

    /// @notice Indicates that order fee rate was changed
    /// @param oldFeeRate The old fee rate
    /// @param newFeeRate The new set fee rate
    event FeeRateChanged(uint256 oldFeeRate, uint256 newFeeRate);

    /// @notice Indicates that a single series sale has started
    /// @param token The address of the token being sold
    event SaleStarted(address token);

    /// @notice Indicates that the order was cancelled
    event OrderCancelled(uint256 id);

    /// @notice Indicates that orders were matched
    /// @param initId The ID of first matched order
    /// @param matchedId The ID of the second matched order
    event OrdersMatched(uint256 initId, uint256 matchedId);

    /// @notice Indicates that price of the pair was changed
    /// @param tokenA The address of the first token of the pair
    /// @param tokenB The address of the second token of the pair
    /// @param newPrice The new price of the pair in quoted tokens
    event PriceChanged(address tokenA, address tokenB, uint256 newPrice);

    /// @notice Indicates that fees collected with one token were withdrawn
    /// @param token The address of the token in which fees were collected
    /// @param amount The amount of fees withdrawn
    event FeesWithdrawn(address token, uint256 amount);

    /// @dev Indicates that 2/3 of block gas limit was spent during the
    ///      iteration inside the contract method
    /// @param gasLeft How much gas was used
    /// @param gasLimit The block gas limit
    event GasLimitReached(uint256 gasLeft, uint256 gasLimit);

    /// @notice Indicates that price slippage was too big
    /// @param slippage The real slippage
    error SlippageTooBig(uint256 slippage);

    /// @notice Returns the list of IDs of orders user has created
    /// @param user The address of the user
    /// @return The list of IDs of orders user has created
    function getUserOrders(
        address user
    ) external view returns (uint256[] memory);

    /// @notice Checks that order with the given ID exists
    /// @param id The ID to search for
    /// @return True if order with the given ID exists. Otherwise - false
    function checkOrderExists(uint256 id) external view returns (bool);

    /// @notice Returns information about the given order
    /// @param _id The ID of the order to search
    /// @return The creator of the order
    /// @return The address of the token that is purchased
    /// @return The address of the token that is sold
    /// @return The initial amount of active tokens
    /// @return The current increasing amount of active tokens
    /// @return The type of the order
    /// @return The side of the order
    /// @return The limit price of the order in quoted tokens
    /// @return True if order is cancellable. Otherwise - false
    /// @return The current status of the order
    function getOrder(
        uint256 _id
    )
        external
        view
        returns (
            address,
            address,
            address,
            uint256,
            uint256,
            OrderType,
            OrderSide,
            uint256,
            bool,
            OrderStatus
        );

    /// @notice Returns the lisf of IDs of orders containing given tokens
    /// @param tokenA The address of the token that is purchased
    /// @param tokenB The address of the token that is sold
    /// @return The list of IDs of orders containing given tokens
    function getOrdersByTokens(
        address tokenA,
        address tokenB
    ) external view returns (uint256[] memory);

    /// @notice Checks if orders have matched any time before
    /// @param firstId The ID of the first order to check
    /// @param secondId The ID of the second order to check
    /// @return True if orders matched. Otherwise - false
    function checkMatched(
        uint256 firstId,
        uint256 secondId
    ) external view returns (bool);

    /// @notice Creates a buy market order
    /// @param tokenA The address of the token that is purchased
    /// @param tokenB The address of the token that is sold
    /// @param amount The amount of active tokens
    /// @param slippage Allowed price slippage (in basis points)
    function buyMarket(
        address tokenA,
        address tokenB,
        uint256 amount,
        uint256 slippage
    ) external;

    /// @notice Creates a sell market order
    /// @param tokenA The address of the token that is purchased
    /// @param tokenB The address of the token that is sold
    /// @param amount The amount of active tokens
    /// @param slippage Allowed price slippage (in basis points)
    function sellMarket(
        address tokenA,
        address tokenB,
        uint256 amount,
        uint256 slippage
    ) external;

    /// @notice Creates an buy limit order
    /// @param tokenA The address of the token that is purchased
    /// @param tokenB The address of the token that is sold
    /// @param amount The amount of active tokens
    /// @param limitPrice The limit price of the order in quoted tokens
    /// @param isCancellable True if order is cancellable. Otherwise - false
    function buyLimit(
        address tokenA,
        address tokenB,
        uint256 amount,
        uint256 limitPrice,
        bool isCancellable
    ) external;

    /// @notice Creates an sell limit order
    /// @param tokenA The address of the token that is purchased
    /// @param tokenB The address of the token that is sold
    /// @param amount The amount of active tokens
    /// @param limitPrice The limit price of the order in quoted tokens
    /// @param isCancellable True if order is cancellable. Otherwise - false
    function sellLimit(
        address tokenA,
        address tokenB,
        uint256 amount,
        uint256 limitPrice,
        bool isCancellable
    ) external;

    /// @notice Cancels the limit order with the given ID.
    ///         Only limit orders can be cancelled
    /// @param id The ID of the limit order to cancel
    function cancelOrder(
        uint256 id
    ) external;

    /// @notice Starts a single series sale of project tokens
    /// @param tokenA The address of the token that is received
    /// @param tokenB The address of the token that is sold
    /// @param amount The amount of sold tokens
    /// @param price The limit price of the order in quoted tokens
    function startSaleSingle(
        address tokenA,
        address tokenB,
        uint256 amount,
        uint256 price
    ) external;

    /// @notice Starts a multiple series sale of project tokens
    /// @param tokenA The address of the token that is received
    /// @param tokenB The address of the token that is sold
    /// @param amounts The list of amounts of sold tokens. One for each series
    /// @param prices The list of prices of sold tokens. One for each series
    function startSaleMultiple(
        address tokenA,
        address tokenB,
        uint256[] memory amounts,
        uint256[] memory prices
    ) external;

    /// @notice Executes matched orders
    /// @param initId The ID of the market/limit order
    /// @param matchedIds The list of IDs of limit orders
    /// @param nonce A unique integer for each tx call
    /// @param signature The signature used to sign the hash of the message
    /// @dev Sum of locked amounts of `matchedIds` is always less than or
    ///      equal to the
    function matchOrders(
        uint256 initId,
        uint256[] memory matchedIds,
        uint256 nonce,
        bytes calldata signature
    ) external;

    /// @notice Sets a new fee rate
    /// @param newFeeRate A new fee rate
    function setFee(uint256 newFeeRate) external;

    /// @notice Withdraws fees accumulated by creation of specified orders
    /// @param tokens The list of addresses of active tokens of the order
    function withdrawFees(address[] memory tokens) external;

    /// @notice Withdraws all fees accumulated by creation of orders
    function withdrawAllFees() external;

    /// @notice Sets the address of the backend account
    /// @param acc The address of the backend account
    /// @dev This function should be called right after contract deploy.
    ///      Otherwise, order creation/cancelling/matching will not work.
    function setBackend(address acc) external;
}
