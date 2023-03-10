// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";

contract OrderController is Ownable, ReentrancyGuard {
    struct Order {
        uint256 id;
        uint256 amountA;
        uint256 amountB;
        uint256 amountLeftToFill;
        uint256 fees;
        address tokenA;
        address tokenB;
        address user;
        bool isCancelled;
    }

    uint256 internal _nextOrderId; // next order id
    uint256 public feeRate; // fee rate
    mapping(uint256 => Order) internal _orders;
    mapping(address => uint256) internal _feeBalances;
    mapping(address => uint256[]) internal _userOrderIds;
    uint256[] internal _orderIds;

    uint256 private constant TEN_THOUSAND = 10000;

    event OrderCreated(
        uint256 id,
        uint256 amountA,
        uint256 amountB,
        address tokenA,
        address tokenB,
        address user,
        bool isMarket
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

    constructor(uint256 fee) {
        require(fee < TEN_THOUSAND, "OC:BAD_FEE");
        feeRate = fee;
        _nextOrderId = 0;
    }

    function getOrderIdLength() external view returns (uint256) {
        return _orderIds.length;
    }

    function getOrderId(uint256 index) external view returns (uint256) {
        return _orderIds[index];
    }

    function getUserOrderIdsLength() external view returns (uint256) {
        return _userOrderIds[_msgSender()].length;
    }

    function getUserOrderIds(uint256 from, uint256 length)
        external
        view
        returns (uint256[] memory)
    {
        uint256[] memory userOrderIds = _userOrderIds[_msgSender()];
        if (_userOrderIds[_msgSender()].length > 1000) {
            uint256 cnt;
            uint256 limit = from + length >= userOrderIds.length
                ? userOrderIds.length
                : from + length;
            uint256[] memory paginatedArray = new uint256[](limit - from);
            for (uint256 i = from; i < limit; i++) {
                paginatedArray[cnt++] = userOrderIds[i];
            }
            return paginatedArray;
        }
        return userOrderIds;
    }

    function getOrderInfo(uint256 _id)
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            address,
            address,
            address,
            bool
        )
    {
        Order memory order = _orders[_id];
        return (
            order.id,
            order.amountA,
            order.amountB,
            order.amountLeftToFill,
            order.fees,
            order.tokenA,
            order.tokenB,
            order.user,
            order.isCancelled
        );
    }

    function getAccumulatedFeeBalance(address token) external view onlyOwner returns (uint256) {
        return _feeBalances[token];
    }

    function cancelOrder(uint256 id) external {
        Order storage order = _orders[id];
        require(_msgSender() == order.user, "OC:NOT_AUTHORIZED");
        require(!order.isCancelled, "OC:ALREADY_CANCELED");
        order.isCancelled = true;
        uint256 transferAmount = (order.amountB * order.amountLeftToFill) / order.amountA;
        TransferHelper.safeTransfer(order.tokenB, order.user, transferAmount);
        emit OrderCancelled(order.id);
    }

    function setFee(uint256 newFeeRate) external onlyOwner {
        require(newFeeRate != feeRate, "OC:OLD_FEE_VALUE");
        emit FeeRateChanged(feeRate, newFeeRate);
        feeRate = newFeeRate;
    }

    function withdrawFee(address token) external onlyOwner {
        TransferHelper.safeTransfer(token, _msgSender(), _feeBalances[token]);
        _feeBalances[token] = 0;
    }

    function min(uint256 a, uint256 b) internal pure returns(uint256) {
        return a < b ? a : b;
    }

    function matchOrders(
        uint256[] calldata matchedOrderIds,
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        bool isMarket
    ) external nonReentrant {
        uint256 totalPayout;
        uint256 totalPaid;
        uint256 id = _generateOrderId(tokenA, tokenB, amountA, amountB, _msgSender(), isMarket);
        Order storage newOrder = _orders[id];

        for (uint256 i = 0; i < matchedOrderIds.length; i++) {
            if (newOrder.amountLeftToFill == 0 || totalPaid >= amountB) {
                break;
            }

            Order storage matchedOrder = _orders[matchedOrderIds[i]];

            if (matchedOrder.id != matchedOrderIds[i]) {
                continue; // ignore incorrect ids
            }
            uint256 matchedOrderAmountB = matchedOrder.amountB;
            uint256 matchedOrderAmountA = matchedOrder.amountA;
            uint256 matchedOrderAmountLeftToFill = matchedOrder.amountLeftToFill;

            require(
                matchedOrder.tokenB == tokenA && matchedOrder.tokenA == tokenB,
                "OC:BAD_TOKEN_MATCH"
            );

            if (!isMarket) {
                require(
                    amountA * matchedOrderAmountA <= amountB * matchedOrderAmountB,
                    "OC:BAD_PRICE_MATCH"
                );
            }

            if (matchedOrderAmountLeftToFill == 0 || matchedOrder.isCancelled) {
                continue;
            }

            uint256 matchedReceived;

            if (
                newOrder.amountLeftToFill * matchedOrderAmountA >=
                matchedOrderAmountLeftToFill * matchedOrderAmountB
            ) {
                // Alf >= mAlf * mB/mA => we can take all mAlf and Alf will still not be filled
                // calculate delta B max
                matchedReceived = min(matchedOrderAmountLeftToFill, amountB - totalPaid);
                matchedOrder.fees += _getFee(matchedReceived);

                uint256 transferAmountA = (matchedReceived * matchedOrderAmountB) / matchedOrderAmountA;
                totalPayout += transferAmountA;

                newOrder.amountLeftToFill -= transferAmountA;
                matchedOrder.amountLeftToFill -= matchedReceived;
            } else {
                // we can take all Alf and matched order will still not be closed
                // calculate delta B max
                uint256 transferAmountB =
                min(
                    amountB - totalPaid,
                    (newOrder.amountLeftToFill * matchedOrderAmountA) / matchedOrderAmountB
                );
                uint256 amountFilled = transferAmountB * matchedOrderAmountB / matchedOrderAmountA;
                matchedOrder.fees += _getFee(transferAmountB);

                totalPayout += amountFilled;
                matchedReceived = transferAmountB;

                newOrder.amountLeftToFill -= amountFilled;
                matchedOrder.amountLeftToFill -= transferAmountB;
            }

            TransferHelper.safeTransferFrom(
                tokenB,
                _msgSender(),
                matchedOrder.user,
                _subFee(matchedReceived)
            );
            totalPaid += matchedReceived;

            emit OrderMatched(
                matchedOrder.id,
                id,
                matchedReceived,
                0, // amount was paid previously
                matchedOrder.amountLeftToFill,
                matchedOrder.fees,
                feeRate
            );
        }

        // TODO: try to enhance
        if (newOrder.amountLeftToFill > 0) {
            // consider adding threshold amount to config
            if (isMarket) {
                // effectively close the order
                newOrder.amountLeftToFill = 0;
            } else {
                // let order stay, transfer remaining amount to contract
                // thereby legitimating the order
                uint256 transferAmount = (newOrder.amountLeftToFill * amountB) / amountA;
                TransferHelper.safeTransferFrom(
                    tokenB,
                    _msgSender(),
                    address(this),
                    transferAmount
                );
            }
        }

        TransferHelper.safeTransfer(tokenA, _msgSender(), _subFee(totalPayout));
        uint256 totalFeeA = _getFee(totalPayout);
        uint256 totalFeeB = _getFee(totalPaid);
        TransferHelper.safeTransferFrom(tokenB, _msgSender(), address(this), totalFeeB);

        _feeBalances[tokenA] = _feeBalances[tokenA] + totalFeeA;
        _feeBalances[tokenB] = _feeBalances[tokenB] + totalFeeB;

        newOrder.fees = newOrder.fees + totalFeeA;

        emit OrderMatched(
            id,
            0, // order owner is initiator
            totalPayout, // received amount
            totalPaid, // paid amount
            newOrder.amountLeftToFill,
            newOrder.fees,
            feeRate
        );
    }

    function createOrder(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB
    ) external nonReentrant {
        _createOrder(tokenA, tokenB, amountA, amountB, _msgSender(), false);
    }

    function _getFee(uint256 amount) private view returns (uint256 retAmount) {
        retAmount = (amount * feeRate) / TEN_THOUSAND;
    }

    function _subFee(uint256 amount) private view returns (uint256 retAmount) {
        retAmount = amount - _getFee(amount);
    }

    function _generateOrderId(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        address user,
        bool isMarket
    ) private returns (uint256) {
        require(tokenA != address(0) && tokenB != address(0), "OC:ZERO_ADDRESS");
        require(tokenA != tokenB, "OC:BAD_PAIR");
        require(amountA > 0 && amountB > 0, "OC:BAD_AMOUNT");

        uint256 id = uint256(keccak256(abi.encodePacked(block.timestamp, user, _nextOrderId++)));
        _orders[id] = Order(id, amountA, amountB, amountA, 0, tokenA, tokenB, user, false);
        _orderIds.push(id);
        _userOrderIds[user].push(id);
        emit OrderCreated(id, amountA, amountB, tokenA, tokenB, user, isMarket);
        return id;
    }

    function _createOrder(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        address user,
        bool isMarket
    ) private {
        _generateOrderId(tokenA, tokenB, amountA, amountB, user, isMarket);
        TransferHelper.safeTransferFrom(tokenB, user, address(this), amountB);
    }
}
