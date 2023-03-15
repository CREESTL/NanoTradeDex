// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./interfaces/IOrderController.sol";
import "./interfaces/IBentureProducedToken.sol";

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
            OrderType,
            OrderSide,
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
            order.amountInitial,
            order.amountCurrent,
            order.type_,
            order.side,
            order.limit,
            order.isCancellable,
            order.status
        );
    }


    /// @notice See {IOrderController-createOrder}
    function createOrder(
        address tokenA,
        address tokenB,
        uint256 amount,
        OrderType type_,
        OrderSide side,
        uint256 limit,
        bool isCancellable
    ) external nonReentrant {
        _createOrder(
            tokenA,
            tokenB,
            amount,
            type_,
            side,
            limit,
            isCancellable
        );
    }

    /// @notice See {IOrderController-cancelOrder}
    function cancelOrder(uint256 id) external nonReentrant {
        _cancelOrder(id);
    }

    /// @notice See {IOrderController-startSaleSingle}
    function startSaleSingle(
        address tokenB,
        address tokenA,
        uint256 amountB,
        uint256 price
    )
        external
        nonReentrant
    {
        // TODO remove this check?
        // Only admin of the `tokenB` project can start the ICO of tokens
        require(IBentureProducedToken(tokenB).checkAdmin(msg.sender), "OC: Not an admin of the project");
        // Price is the amount of tokenB paid for 1 tokenA
        uint256 amountA = amountB * price;

        emit SaleStarted(tokenB);

        _createOrder(
            // Switch addresses' places
            tokenA,
            tokenB,
            amountA,
            amountB,
            OrderType.Limit,
            // TODO place 0 here for some time. Should there be a limit at all???
            0,
            // Sale orders are non-cancellable
            false
        );

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
        address tokenA,
        address tokenB,
        uint256 amount,
        OrderType type_,
        OrderSide side,
        uint256 limit,
        bool isCancellable
    ) private {
        require(tokenA != address(0), "OC: Cannot buy native tokens!");
        require(amount != 0, "OC: Cannot buy/sell zero tokens!");
        // TODO add check that tokenB was created in factory???
        // The token being locked to create an order
        address lockedToken;
        if (type_ == OrderType.Market) {
            require(limit == 0, "OC: Limit not zero in market order!");
            if (side == OrderSide.Sell){
                // Selling `tokenB` in market order requires locking the same token
                lockedToken = tokenB;
            }
            if (side == OrderSide.Buy) {
                // TODO is that so?
                // Buying `tokenA` in market order requires locking locking `tokenB` as well
                lockedToken = tokenB;

            }
        }
        if (type_ == OrderType.Limit) {
            require(limit != 0, "OC: Limit zero in limit order!");
            if (side == OrderSide.Sell){
                // Selling `tokenB` in market order requires locking the same token
                lockedToken = tokenB;
            }
            if (side == OrderSide.Buy) {
                // TODO Do we always only lock tokenB???
                // Buying `tokenA` in market order requires locking locking `tokenB` as well
                lockedToken = tokenB;

            }
        }

        // TODO is this correct formula???
        // Calculate the fee amount for the order
        uint256 fee = (amount * feeRate) / HUNDRED_PERCENT;

        // NOTICE: first order gets the ID of 1
        _orderId.increment();
        uint256 id = _orderId.current();
        // TODO check args, especially limit
        _orders[id] = Order(
            id,
            msg.sender,
            tokenA,
            tokenB,
            amount,
            amount,
            type_,
            side,
            limit,
            isCancellable,
            OrderStatus.Active,
            fee
        );
        _usersToOrders[msg.sender].push(id);

        emit OrderCreated(id);

        // Sold / bought tokens are transferred to the contract
        IERC20(lockedToken).safeTransfer(msg.sender, activeAmount);
        // Fee is also transferred to the contract
        // TODO transfer it strate to admins wallet instead???
        IERC20(activeToken).safeTransferFrom(msg.sender, address(this), fee);
    }

    function _cancelOrder(uint256 id) private {
        Order storage order = _orders[id];
        require(order.isCancellable, "OC: Order is non-cancellable!");
        // Only limit orders can be cancelled
        require(order.type_ == OrderType.Limit, "OC: Not a limit order!");
        require(
            (order.status == OrderStatus.Active) || (order.status == OrderStatus.PartiallyClosed),
            "OC: Invalid order status!"
        );
        require(msg.sender == order.user, "OC: Not the order creator!");
        // Only the status of the order gets changed
        // The order itself does not get deleted
        order.status = OrderStatus.Cancelled;
        address activeToken;
        if (order.side == OrderSide.Buy) {
            activeToken = order.tokenA;
        }
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
