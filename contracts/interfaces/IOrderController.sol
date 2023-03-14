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

    /// @dev The side of the order (Buy or Sell)
    enum OrderSide {
        Buy,
        Sell
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

    /// @dev The structure of the single order
    struct Order {
        // The ID (number) of the order
        uint256 id;
        // The address which created an order
        address user;
        // The address of the tokens that is being bought
        address tokenA;
        // The address of the tokens that is being sold
        address tokenB;
        // The amount of tokens that are being bought
        // Should be 0, if it's a market sell order
        uint256 amountA;
        // The amount of tokens that are being sold
        // Should be 0, if it's a market buy order
        uint256 amountB;
        // Amount of tokens left to complete the order.
        // Partial order execution is supported
        uint256 amountLeftToFill;
        // Order type (market or limit)
        OrderType type_;
        // TODO do I need this?
        // Order side (buy or sell)
        OrderSide side;
        // Only for limit orders. Zero for market orders
        uint256 limit;
        // Cancellability
        bool isCancellable;
        // Status
        OrderStatus status;
        // The amount of `tokenA` or `tokenB` paid as fee
        uint256 fee;
    }

    /// @notice Indicates that a new order has been created.
    /// @param id The ID of the created order
    /// @dev No need to pass all order fields here. It's easier to use getter by ID
    event OrderCreated(
        uint256 indexed id
    );

    // TODO change that
    // TODO add field description
    /// @notice Indicates that two orders have matched
    event OrderMatched(
        uint256 id,
        uint256 matchedId, // 0 for initiator
        uint256 amountReceived, // received amount, need to deduct fee
        uint256 amountPaid, // paid amount, need to deduct fee
        uint256 amountLeftToFill,
        uint256 fee,
        uint256 feeRate // current fee rate, it can be changed
    );

    /// @notice Indicates that order fee rate was changed
    /// @param oldFeeRate The old fee rate
    /// @param newFeeRate The new set fee rate
    event FeeRateChanged(uint256 oldFeeRate, uint256 newFeeRate);

    /// @notice Indicates that the order was cancelled
    event OrderCancelled(uint256 id);

    /// @notice Returns the list of IDs of orders user has created
    /// @param user The address of the user
    /// @return The list of IDs of orders user has created
    function getUserOrders(address user) external view returns (uint256[] memory);


    /// @notice Returns information about the given order
    /// @param _id The ID of the order to search
    /// @return The creator of the order
    /// @return The address of the token that is purchased
    /// @return The address of the token that is sold
    /// @return The amount of purchased tokens
    /// @return The amount of sold tokens
    /// @return The amount of tokens left for order to be closed
    /// @return The type of the order
    /// @return The side of the order
    /// @return The limit amount of the order (for limit orders only)
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
    /// @param amountA The amount of purchased tokens
    /// @param amountB The amount of sold tokens
    /// @param type_ The type of the order
    /// @param side The side of the order
    /// @param limit The limit amount of the order (for limit orders only)
    /// @param isCancellable True if order is cancellable. Otherwise - false
    function createOrder(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        OrderType type_,
        OrderSide side,
        uint256 limit,
        bool isCancellable
    ) external;

    /// @notice Cancels the order with the given ID
    /// @param id The ID of the order to cancel
    function cancelOrder(uint256 id) external;

    /// @notice Sets a new fee rate
    /// @param newFeeRate A new fee rate
    function setFee(uint256 newFeeRate) external;

    // TODO parameters will change in the future
    /// @notice Withdraws fees accumulated by orders of one token
    /// @param token The address of the token to withdraw fees of
    function withdrawFee(address token) external;

    // TODO will change in the future
    /// @notice Executes matched orders
    /// @param matchedOrderIds The list of IDs of matched orders
    /// @param tokenA The address of the token that is purchased
    /// @param tokenB The address of the token that is sold
    /// @param amountA The amount of purchased tokens
    /// @param amountB The amount of sold tokens
    function matchOrders(
        uint256[] calldata matchedOrderIds,
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        bool isMarket
    ) external;

}
