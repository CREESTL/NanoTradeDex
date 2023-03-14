// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./interfaces/IOrderController.sol";

contract OrderController is IOrderController, Ownable, ReentrancyGuard {

    using Counters for Counters.Counter;
    using SafeERC20 for IERC20;

    Counters.Counter internal _orderId;
    uint256 public feeRate;
    /// @dev Order's index is (order's ID - 1)
    mapping(uint256 => Order) internal _orders;
    mapping(address => uint256) internal _feeBalances;
    /// @dev Mapping from user address to the array of orders IDs he created
    // TODO add getters for that
    mapping(address => uint256[]) internal _usersToOrders;

    /// @dev 100% in basis points (1 bp = 1 / 100 of 1%)
    uint256 private constant HUNDRED_PERCENT = 10000;


    constructor(uint256 fee) {
        require(fee < HUNDRED_PERCENT, "OC:BAD_FEE");
        feeRate = fee;
    }

    /// @notice See {IOrderController-getUserOrders}
    function getUserOrders(
        address user
    ) external view returns (uint256[] memory) {
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
            order.amountA,
            order.amountB,
            order.amountLeftToFill,
            order.type_,
            order.side,
            order.limit,
            order.isCancellable,
            order.status
        );
    }

    function getAccumulatedFeeBalance(address token) external view onlyOwner returns (uint256) {
        return _feeBalances[token];
    }

    function createOrder(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        OrderType type_,
        OrderSide side,
        uint256 limit,
        bool isCancellable
    ) external nonReentrant {
        _createOrder(
            msg.sender,
            tokenA,
            tokenB,
            amountA,
            amountB,
            type_,
            side,
            limit,
            isCancellable
        );
    }

    function cancelOrder(uint256 id) external {
        Order storage order = _orders[id];
        require(msg.sender == order.user, "OC:NOT_AUTHORIZED");
        require(order.status != OrderStatus.Cancelled, "OC:ALREADY_CANCELED");
        order.status = OrderStatus.Cancelled;
        uint256 transferAmount = (order.amountB * order.amountLeftToFill) / order.amountA;
        IERC20(order.tokenB).safeTransfer(order.user, transferAmount);
        emit OrderCancelled(order.id);
    }

    function setFee(uint256 newFeeRate) external onlyOwner {
        require(newFeeRate != feeRate, "OC:OLD_FEE_VALUE");
        emit FeeRateChanged(feeRate, newFeeRate);
        feeRate = newFeeRate;
    }

    function withdrawFee(address token) external onlyOwner {
        IERC20(token).safeTransfer(msg.sender, _feeBalances[token]);
        _feeBalances[token] = 0;
    }


    function matchOrders(
        uint256[] calldata matchedOrderIds,
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        bool isMarket
    ) external nonReentrant {
    }


    function _getFee(uint256 amount) private view returns (uint256 retAmount) {
        retAmount = (amount * feeRate) / HUNDRED_PERCENT;
    }

    function _subFee(uint256 amount) private view returns (uint256 retAmount) {
        retAmount = amount - _getFee(amount);
    }

    function min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }

    function _createOrder(
        address user,
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        OrderType type_,
        OrderSide side,
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
        // For market orders one of `amounts` should be zero
        if (type_ == OrderType.Market) {
            // When buying tokens, `amountB` should be zero
            if (side == OrderSide.Buy) {
                require(amountA != 0, "OC: Cannot buy zero tokens!");
                require(amountB == 0, "OC: Selling amount should be zero!");
                activeAmount = amountA;
                activeToken = tokenA;
            }
            // When selling tokens, `amountA` should be zero
            if (side == OrderSide.Sell) {
                require(amountB != 0, "OC: Cannot sell zero tokens!");
                require(amountA == 0, "OC: Buying amount should be zero!");
                activeAmount = amountB;
                activeToken = tokenB;
            }
        // For limit orders both `amounts` should not be zero
        } else {
            // TODO more checks here???
            require((amountA != 0) && (amountB != 0), "OC: Invalid token amounts for limit order!");
            if (side == OrderSide.Buy) {
                activeAmount = amountA;
                activeToken = tokenA;
            }
            if (side == OrderSide.Sell) {
                activeAmount = amountB;
                activeToken = tokenB;
            }
            require(limit != 0, "OC: Limit cannot be zero!");
        }

        // TODO is this correct formula???
        // Calculate the fee amount for the order
        uint256 fee = activeAmount * feeRate / HUNDRED_PERCENT;

        // NOTICE: first order gets the ID of 1
        _orderId.increment();
        uint256 id = _orderId.current();
        // TODO check args, especially limit
        _orders[id] = Order(
            id,
            user,
            tokenA,
            tokenB,
            amountA,
            amountB,
            amountA,
            type_,
            side,
            limit,
            isCancellable,
            OrderStatus.Active,
            fee
        );
        _usersToOrders[user].push(id);


        emit OrderCreated(
            id
        );


        // Sold / bought tokens are transferred to the contract
        IERC20(activeToken).safeTransfer(user, activeAmount);
        // Fee is also transferred to the contract
        // TODO transfer it strate to admins wallet instead???
        IERC20(activeToken).safeTransferFrom(user, address(this), fee);



    }
}
