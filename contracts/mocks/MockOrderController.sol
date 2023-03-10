// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";

contract MockOrderController is Ownable {
    struct Order {
        uint256 id;
        uint256 amountA;
        uint256 amountB;
        uint256 amountLeftToFill;
        address tokenA;
        address tokenB;
        address user;
        bool isCancelled;
    }

    uint256 internal _nonce;
    uint256 internal _fee;
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
    event OrderUpdated(
        uint256 id,
        uint256 amountA,
        uint256 amountB,
        uint256 amountLeftToFill,
        address tokenA,
        address tokenB,
        address user,
        bool isMarket,
        uint256 fee
    );
    event OrderCancelled(uint256 id);

    constructor(uint256 fee) {
        _fee = TEN_THOUSAND - fee;
        _nonce = 0;
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
            uint256 cnt = 0;
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
            order.tokenA,
            order.tokenB,
            order.user,
            order.isCancelled
        );
    }

    function getAccumulatedFeeBalance(address token) external view onlyOwner returns (uint256) {
        return _feeBalances[token];
    }

    function getFee() external view returns (uint256) {
        return TEN_THOUSAND - _fee;
    }

    function cancelOrder(uint256 id) external {
        Order storage order = _orders[id];
        require(_msgSender() == order.user, "OC:NOT_AUTHORIZED");
        uint256 transferAmount = (order.amountB * order.amountLeftToFill) / order.amountA;
        TransferHelper.safeTransfer(order.tokenB, order.user, transferAmount);
        order.isCancelled = true;
        emit OrderCancelled(order.id);
    }

    function setFee(uint256 newFee) external onlyOwner {
        _fee = TEN_THOUSAND - newFee;
    }

    function withdrawFee(address token) external onlyOwner {
        TransferHelper.safeTransfer(token, _msgSender(), _feeBalances[token]);
        _feeBalances[token] = 0;
    }

    function matchOrders(
        uint256[] calldata matchedOrderIds,
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        bool isMarket
    ) external {
        // require(matchedOrderIds.length > 0 &&
        // tokenA != address(0) && tokenB != address(0) &&
        // ERC20(tokenB).balanceOf(_msgSender()) >= amountB
        // , "OC: BAD MATCH");

        uint256 totalPayout;
        uint256 totalFee;
        uint256 id = _generateOrderId(
            tokenA,
            tokenB,
            amountA,
            amountB,
            amountA,
            _msgSender(),
            isMarket
        );
        Order storage newOrder = _orders[id];

        for (uint256 i = 0; i < matchedOrderIds.length; i++) {
            Order storage matchedOrder = _orders[matchedOrderIds[i]];
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

            if (
                newOrder.amountLeftToFill * matchedOrderAmountA >=
                matchedOrderAmountLeftToFill * matchedOrderAmountB
            ) {
                uint256 transferAmount = (matchedOrderAmountLeftToFill * matchedOrderAmountB) /
                    matchedOrderAmountA;
                uint256 fee = _getFee(matchedOrderAmountLeftToFill);

                assembly {
                    totalPayout := add(totalPayout, transferAmount)
                }
                assembly {
                    totalFee := add(totalFee, fee)
                }
                TransferHelper.safeTransferFrom(
                    tokenB,
                    _msgSender(),
                    matchedOrder.user,
                    _getAmountSubFee(matchedOrderAmountLeftToFill)
                );
                newOrder.amountLeftToFill -= transferAmount;
                matchedOrder.amountLeftToFill = 0;
                // emit OrderUpdated(
                //     matchedOrder.id,
                //     matchedOrder.amountA,
                //     matchedOrder.amountB,
                //     matchedOrder.amountLeftToFill,
                //     matchedOrder.tokenA,
                //     matchedOrder.tokenB,
                //     matchedOrder.user,
                //     false,
                //     _getFee(transferAmount)
                // );
            } else {
                uint256 transferAmount = (newOrder.amountLeftToFill * matchedOrderAmountA) /
                    matchedOrderAmountB;
                uint256 fee = _getFee(transferAmount);

                totalPayout += newOrder.amountLeftToFill;
                assembly {
                    totalFee := add(totalFee, fee)
                }

                TransferHelper.safeTransferFrom(
                    tokenB,
                    _msgSender(),
                    matchedOrder.user,
                    _getAmountSubFee(transferAmount)
                );
                matchedOrder.amountLeftToFill -= transferAmount;
                newOrder.amountLeftToFill = 0;
                // emit OrderUpdated(
                //     matchedOrder.id,
                //     matchedOrder.amountA,
                //     matchedOrder.amountB,
                //     matchedOrder.amountLeftToFill,
                //     matchedOrder.tokenA,
                //     matchedOrder.tokenB,
                //     matchedOrder.user,
                //     false,
                //     _getFee(transferAmount)
                // );
            }
        }
        // emit OrderUpdated(
        //     id,
        //     newOrder.amountA,
        //     newOrder.amountB,
        //     newOrder.amountLeftToFill,
        //     newOrder.tokenA,
        //     newOrder.tokenB,
        //     newOrder.user,
        //     isMarket,
        //     totalFee
        // );

        if (newOrder.amountLeftToFill > 100 && !isMarket) {
            uint256 transferAmount = (newOrder.amountLeftToFill * amountB) / amountA;
            TransferHelper.safeTransferFrom(tokenB, _msgSender(), address(this), transferAmount);
        }

        TransferHelper.safeTransfer(tokenA, _msgSender(), _getAmountSubFee(totalPayout));
        TransferHelper.safeTransferFrom(tokenB, _msgSender(), address(this), totalFee);
        _feeBalances[tokenA] += _getFee(totalPayout);
        _feeBalances[tokenB] += totalFee;
    }

    // function _createOrder(address tokenA, address tokenB, uint256 amountA, uint256 amountB, uint256 amountLeftToFill) external {
    //     require(amountA > 0 && amountB > 0, "OC:BAD_AMOUNT");
    //     require(tokenA != address(0) && tokenB != address(0), "OC:ZERO_ADDRESS");
    //     require(tokenA != tokenB, "OC:BAD_PAIR");
    //     address user = _msgSender();
    //     createOrderTest(tokenA, tokenB, amountA, amountB, amountLeftToFill, user, false);
    // }

    function _getAmountSubFee(uint256 amount) private view returns (uint256) {
        return (amount * _fee) / TEN_THOUSAND;
    }

    function _getFee(uint256 amount) private view returns (uint256) {
        return amount - _getAmountSubFee(amount);
    }

    function _generateOrderId(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 amountLeftToFill,
        address user,
        bool isMarket
    ) private returns (uint256) {
        uint256 id = uint256(keccak256(abi.encodePacked(block.timestamp, user, _nonce)));
        _nonce++;
        _orders[id] = Order(id, amountA, amountB, amountLeftToFill, tokenA, tokenB, user, false);
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
        uint256 amountLeftToFill,
        address user,
        bool isMarket
    ) public {
        uint256 transferAmount = (amountLeftToFill * amountB) / amountA;
        _generateOrderId(tokenA, tokenB, amountA, amountB, amountLeftToFill, user, isMarket);
        TransferHelper.safeTransferFrom(tokenB, user, address(this), transferAmount);
    }
}
