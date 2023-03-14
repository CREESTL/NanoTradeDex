// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./interfaces/IOrderController.sol";

/// @title Contract that controlls creation and execution of market and limit orders
contract OrderController is IOrderController, Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;
    using SafeERC20 for IERC20;

    /// @notice Percentage of each order being paid as fee (in basis points)
    uint256 public feeRate;
    /// @dev Incrementing IDs of orders
    Counters.Counter internal _orderId;
    /// @dev Order's index is (order's ID - 1)
    mapping(uint256 => Order) internal _orders;
    /// @dev Mapping from user address to the array of orders IDs he created
    // TODO add getters for that
    mapping(address => uint256[]) internal _usersToOrders;

    /// @dev 100% in basis points (1 bp = 1 / 100 of 1%)
    uint256 private constant HUNDRED_PERCENT = 10000;

    /// @notice Sets the inital fee rate for orders
    constructor(uint256 fee) {
        require(fee < HUNDRED_PERCENT, "OC: Fee too low!");
        feeRate = fee;
    }

    /// @notice See {IOrderController-getUserOrders}
    function getUserOrders(address user) external view returns (uint256[] memory) {
        return _usersToOrders[user];
    }

    /// @notice See {IOrderController-getOrder}
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
            uint256,
            OrderType,
            uint256,
            bool,
            OrderStatus
        )
    {
        Order memory order = _orders[_id];
        return (
            order.user,
            order.tokenA,
            order.tokenB,
            order.amountAInitial,
            order.amountBInitial,
            order.amountACurrent,
            order.amountBCurrent,
            order.type_,
            order.limit,
            order.isCancellable,
            order.status
        );
    }

    /// @notice See {IOrderController-createOrder}
    function createOrder(
        address tokenA,
        address tokenB,
        uint256 amountAInitial,
        uint256 amountBInitial,
        OrderType type_,
        uint256 limit,
        bool isCancellable
    ) external nonReentrant {
        _createOrder(
            msg.sender,
            tokenA,
            tokenB,
            amountAInitial,
            amountBInitial,
            type_,
            limit,
            isCancellable
        );
    }

    /// @notice See {IOrderController-cancelOrder}
    function cancelOrder(uint256 id) external nonReentrant {
        _cancelOrder(id);
    }

    /// @notice See {IOrderController-setFee}
    function setFee(uint256 newFeeRate) external onlyOwner {
        require(newFeeRate != feeRate, "OC: Fee rates must differ!");
        emit FeeRateChanged(feeRate, newFeeRate);
        feeRate = newFeeRate;
    }

    /// @notice See {IOrderController-withdrawFee}
    function withdrawFee(address token) external onlyOwner {
        // TODO body
    }

    /// @notice See {IOrderController-matchOrders}
    function matchOrders(
        uint256[] calldata matchedOrderIds,
        address tokenA,
        address tokenB,
        uint256 amountAInitial,
        uint256 amountBInitial,
        bool isMarket
    ) external nonReentrant {}

    /// @dev Calculates fee based on the amount of tokens
    /// @param amount The amount of transferred tokens
    /// @return retAmount The fee amount that should be paid for order creation and tokens transfer
    function _getFee(uint256 amount) private view returns (uint256 retAmount) {
        retAmount = (amount * feeRate) / HUNDRED_PERCENT;
    }

    /// @dev Subtracts the fee from transferred tokens amount
    /// @param amount The amount of transferred tokens
    /// @return retAmount The transferred amount minus the fee
    function _subFee(uint256 amount) private view returns (uint256 retAmount) {
        retAmount = amount - _getFee(amount);
    }

    /// @dev Finds the minimum of two values
    /// @param a The first value
    /// @param b The second value
    /// @return The minimum of two values
    function min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }

    function _createOrder(
        address user,
        address tokenA,
        address tokenB,
        uint256 amountAInitial,
        uint256 amountBInitial,
        OrderType type_,
        uint256 limit,
        bool isCancellable
    ) private {
        require(user != address(0), "OC: Invalid user address!");
        require(tokenA != address(0), "OC: Cannot buy native tokens!");
        // TODO add check that tokenB was created in factory???
        // The token being sold / bought
        address activeToken;
        // The amount of tokens being sold / bought
        uint256 activeAmount;
        if (type_ == OrderType.Market) {
            // For market orders one of `amounts` should be zero
            require(
                (amountAInitial == 0) || (amountBInitial == 0),
                "OC: Invalid token amounts for market order!"
            );
            require(
                !((amountAInitial == 0) && (amountBInitial == 0)),
                "OC: One amount must be not zero!"
            );
            // If `amountAInitial` is 0, this is a selling order
            if (amountAInitial == 0) {
                activeAmount = amountBInitial;
                activeToken = tokenB;
            }
            // If `amountBInitial` is 0, this is a buying order
            if (amountBInitial == 0) {
                activeAmount = amountAInitial;
                activeToken = tokenA;
            }
        }

        // For limit orders both `amounts` should not be zero
        if (type_ == OrderType.Limit) {
            // TODO more checks here???
            require(
                (amountAInitial != 0) && (amountBInitial != 0),
                "OC: Invalid token amounts for limit order!"
            );
            require(limit != 0, "OC: Limit cannot be zero!");
            // In limit orders `tokenB` is always the one that is locked
            activeToken = tokenB;
            activeAmount = amountBInitial;
        }

        // TODO is this correct formula???
        // Calculate the fee amount for the order
        uint256 fee = (activeAmount * feeRate) / HUNDRED_PERCENT;

        // NOTICE: first order gets the ID of 1
        _orderId.increment();
        uint256 id = _orderId.current();
        // TODO check args, especially limit
        _orders[id] = Order(
            id,
            user,
            tokenA,
            tokenB,
            amountAInitial,
            amountBInitial,
            // Current values are equal to inital at the start
            amountAInitial,
            amountAInitial,
            type_,
            limit,
            isCancellable,
            OrderStatus.Active,
            fee
        );
        _usersToOrders[user].push(id);

        emit OrderCreated(id);

        // Sold / bought tokens are transferred to the contract
        IERC20(activeToken).safeTransfer(user, activeAmount);
        // Fee is also transferred to the contract
        // TODO transfer it strate to admins wallet instead???
        IERC20(activeToken).safeTransferFrom(user, address(this), fee);
    }

    function _cancelOrder(uint256 id) private {
        Order storage order = _orders[id];
        require(order.isCancellable, "OC: Order is non-cancellable!");
        require(order.type_ == OrderType.Limit, "OC: Not a limit order!");
        require(
            (order.status == OrderStatus.Active) || (order.status == OrderStatus.PartiallyClosed),
            "OC: Invalid order status!"
        );
        require(msg.sender == order.user, "OC: Not the order creator!");
        // Only the status of the order gets changed
        // The order itself does not get deleted
        order.status = OrderStatus.Cancelled;
        // Only limit orders can be cancelled
        // Active token for limit orders in always `tokenB`
        address activeToken = order.tokenB;
        // Only the amount of `tokenB` left in the order should be returned
        // In order was partially executed, then this amount is less then `amountBInitial`
        uint256 leftAmount = order.amountBCurrent;

        emit OrderCancelled(order.id);

        // TODO why this formula was used?
        /* uint256 transferAmount = (order.amountBInitial * order.amountLeftToFill) / order.amountAInitial; */
        IERC20(activeToken).safeTransfer(order.user, leftAmount);
    }
}
