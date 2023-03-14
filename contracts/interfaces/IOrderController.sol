// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";

interface IOrderController {

    enum OrderType {
        Market,
        Limit
    }

    enum OrderSide {
        Buy,
        Sell
    }

    enum OrderStatus {
        Active,
        PartiallyClosed,
        Closed,
        Cancelled
    }

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
    /// @dev No need to pass all order fields here. It's easier to use getter by ID
    event OrderCreated(
        uint256 indexed id
    );

    event OrderMatched(
        uint256 id,
        uint256 matchedId, // 0 for initiator
        uint256 amountReceived, // received amount, need to deduct fee
        uint256 amountPaid, // paid amount, need to deduct fee
        uint256 amountLeftToFill,
        uint256 fee,
        uint256 feeRate // current fee rate, it can be changed
    );

    event FeeRateChanged(uint256 oldFeeRate, uint256 newFeeRate);

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

    function getAccumulatedFeeBalance(address token) external view returns (uint256);

    function cancelOrder(uint256 id) external;

    function setFee(uint256 newFeeRate) external;

    function withdrawFee(address token) external;

    function matchOrders(
        uint256[] calldata matchedOrderIds,
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        bool isMarket
    ) external;

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
}
