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
        uint256 limitPrice;
        // Allowed price slippage in Basis Points
        uint256 slippage;
        // Cancellability
        bool isCancellable;
        // Status
        OrderStatus status;
        // The amount of active tokens paid as fee
        uint256 feeAmount;
    }

    /// @notice Indicates that a new order has been created.
    /// @param id The ID of the order
    /// @param user The creator of the order
    /// @param tokenA The address of the token that is purchased
    /// @param tokenB The address of the token that is sold
    /// @param amount The amount of active tokens
    /// @param type_ The type of the order
    /// @param side The side of the order
    /// @param limitPrice The limit price of the order (for limit orders only)
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

    // TODO change that
    // TODO add field description
    /// @notice Indicates that two orders have matched
    event OrderMatched(
        uint256 id,
        uint256 matchedId, // 0 for initiator
        uint256 amountReceived, // received amount, need to deduct fee
        uint256 amountPaid, // paid amount, need to deduct fee
        uint256 fee,
        uint256 feeRate // current fee rate, it can be changed
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

    /// @notice Indicates that fees collected with one token were withdrawn
    /// @param token The address of the token in which fees were collected
    /// @param amount The amount of fees withdrawn
    event FeesWithdrawn(address token, uint256 amount);

    /// @notice Indicates that price slippage was too big
    /// @param slippage The real slippage
    error SlippageTooBig(uint256 slippage);

    /// @notice Returns the list of IDs of orders user has created
    /// @param user The address of the user
    /// @return The list of IDs of orders user has created
    function getUserOrders(
        address user
    ) external view returns (uint256[] memory);

    /// @notice Returns information about the given order
    /// @param _id The ID of the order to search
    /// @return The creator of the order
    /// @return The address of the token that is purchased
    /// @return The address of the token that is sold
    /// @return The initial amount of active tokens
    /// @return The current increasing amount of active tokens
    /// @return The type of the order
    /// @return The side of the order
    /// @return The limit price of the order (for limit orders only)
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

    /// @notice Creates an order with specified parameters
    /// @param tokenA The address of the token that is purchased
    /// @param tokenB The address of the token that is sold
    /// @param amount The amount of active tokens
    /// @param type_ The type of the order
    /// @param side The side of the order (buy / sell)
    /// @param limitPrice The limit price of the order (for limit orders only)
    /// @param slippage Allowed price slippage (in basis points)
    /// @param isCancellable True if order is cancellable. Otherwise - false
    /// @param msgHash The hash of the message signed by backend
    /// @param signature The signature used to sign the hash of the message
    function createOrder(
        address tokenA,
        address tokenB,
        uint256 amount,
        OrderType type_,
        OrderSide side,
        uint256 limitPrice,
        uint256 slippage,
        bool isCancellable,
        bytes32 msgHash,
        bytes calldata signature
    ) external;

    /// @notice Cancels the limit order with the given ID.
    ///         Only limit orders can be cancelled
    /// @param id The ID of the limit order to cancel
    /// @param msgHash The hash of the message signed by backend
    /// @param signature The signature used to sign the hash of the message
    function cancelOrder(
        uint256 id,
        bytes32 msgHash,
        bytes calldata signature
    ) external;

    /// @notice Starts a single series sale of project tokens
    /// @param tokenA The address of the token that is received
    /// @param tokenB The address of the token that is sold
    /// @param amount The amount of sold tokens
    /// @param price The amount of `tokenB` paid for a single `tokenA`
    /// @param msgHash The hash of the message signed by backend
    /// @param signature The signature used to sign the hash of the message
    function startSaleSingle(
        address tokenA,
        address tokenB,
        uint256 amount,
        uint256 price,
        bytes32 msgHash,
        bytes calldata signature
    ) external;

    /// @notice Starts a multiple series sale of project tokens
    /// @param tokenA The address of the token that is received
    /// @param tokenB The address of the token that is sold
    /// @param amounts The list of amounts of sold tokens. One for each series
    /// @param prices The list of prices of sold tokens. One for each series
    /// @param msgHash The hash of the message signed by backend
    /// @param signature The signature used to sign the hash of the message
    function startSaleMultiple(
        address tokenA,
        address tokenB,
        uint256[] memory amounts,
        uint256[] memory prices,
        bytes32 msgHash,
        bytes calldata signature
    ) external;

    /// @notice Executes matched orders
    /// @param initId The ID of the first of matched orders
    /// @param matchedIds The list of IDs that matched with `initId`
    /// @param msgHash The hash of the message signed by backend
    /// @param signature The signature used to sign the hash of the message
    /// @dev Sum of locked amounts of `matchedIds` is always less than or
    ///      equal to the
    function matchOrders(
        uint256 initId,
        uint256[] memory matchedIds,
        bytes32 msgHash,
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
