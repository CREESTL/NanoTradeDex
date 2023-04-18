// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./interfaces/IBentureDex.sol";
import "./interfaces/IBentureProducedToken.sol";

/// @title Contract that controlls creation and execution of market and limit orders
contract BentureDex is IBentureDex, Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @dev Precision used to calculate token amounts rations (prices)
    uint256 constant PRICE_PRECISION = 10 ** 18;

    /// @notice Percentage of each order being paid as fee (in basis points)
    uint256 public feeRate;
    /// @notice The address of the backend account
    address public backendAcc;
    /// @dev Incrementing IDs of orders
    Counters.Counter private _orderId;
    /// @dev Mapping from order ID to order
    mapping(uint256 => Order) private _orders;
    /// @dev Mapping from order ID to matched order ID to boolean
    /// True if IDs matched some time before. Otherwise - false
    mapping(uint256 => mapping(uint256 => bool)) private _matchedOrders;
    /// @dev Mapping from user address to the array of orders IDs he created
    mapping(address => uint256[]) private _usersToOrders;
    /// @dev Mapping from pair tokens addresses to the list of IDs with these tokens
    mapping(address => mapping(address => uint[])) private _tokensToOrders;
    /// @dev Mapping from one token to another to boolean indicating
    ///      that the second tokens is quoated (the price of the first
    ///      is measured in the amount of second tokens)
    mapping(address => mapping(address => bool)) private _isQuoted;
    /// @dev Mapping from unquoted token of the pair to the quoted
    ///      token of the pair to the price (how many quoted tokens
    ///      to pay for a single unquoted token)
    ///      .e.g (USDT => DOGE => 420)
    ///      Each price is multiplied by `PRICE_PRECISION`
    mapping(address => mapping(address => uint256)) private _pairPrices;
    /// @dev Mapping from address of token to list of IDs of orders
    ///      in which fees were paid in this order
    // TODO make a standard delete function for this array
    mapping(address => uint256[]) private _tokensToFeesIds;
    /// @dev List of tokens that are currently locked as fees
    ///         for orders creations
    EnumerableSet.AddressSet private _lockedTokens;
    /// @notice Marks transaction hashes that have been executed already.
    ///         Prevents Replay Attacks
    mapping(bytes32 => bool) private _executed;

    /// @dev 100% in basis points (1 bp = 1 / 100 of 1%)
    uint256 private constant HUNDRED_PERCENT = 10000;

    modifier updateQuotes(address tokenA, address tokenB) {
        // If none of the tokens is quoted, `tokenB_` becomes a quoted token
        if (!_isQuoted[tokenA][tokenB] && !_isQuoted[tokenB][tokenA]) {
            _isQuoted[tokenA][tokenB] = true;
        }
        _;
    }

    /// @notice Sets the inital fee rate for orders
    constructor() {
        // Default fee rate is 0.1% (10 BP)
        feeRate = 10;
    }

    /// @notice See {IBentureDex-getUserOrders}
    function getUserOrders(
        address user
    ) external view returns (uint256[] memory) {
        if (user == address(0)) revert ZeroAddress();
        return _usersToOrders[user];
    }

    /// @notice See {IBentureDex-getOrder}
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
            uint256,
            uint256,
            OrderStatus
        )
    {
        if (!checkOrderExists(_id)) revert OrderDoesNotExist();

        Order memory order = _orders[_id];

        return (
            order.user,
            order.tokenA,
            order.tokenB,
            order.amount,
            order.amountFilled,
            order.type_,
            order.side,
            order.limitPrice,
            order.isCancellable,
            order.feeAmount,
            order.amountLocked,
            order.status
        );
    }

    /// @notice See {IBentureDex-getOrdersByTokens}
    function getOrdersByTokens(
        address tokenA,
        address tokenB
    ) external view returns (uint256[] memory) {
        if (tokenA == address(0)) revert InvalidFirstTokenAddress();
        return _tokensToOrders[tokenA][tokenB];
    }

    /// @notice See {IBentureDex-getPrice}
    function getPrice(
        address tokenA,
        address tokenB
    ) external view returns (address, uint256) {
        if (!_isQuoted[tokenA][tokenB] && !_isQuoted[tokenB][tokenA])
            revert NoQuotedTokens();
        address quotedToken = _isQuoted[tokenA][tokenB] ? tokenB : tokenA;
        return (quotedToken, _getPrice(tokenA, tokenB));
    }

    /// @notice See (IBentureDex-checkMatched)
    function checkMatched(
        uint256 firstId,
        uint256 secondId
    ) external view returns (bool) {
        if (!checkOrderExists(firstId)) revert OrderDoesNotExist();
        if (!checkOrderExists(secondId)) revert OrderDoesNotExist();
        if (
            _matchedOrders[firstId][secondId] ||
            _matchedOrders[secondId][firstId]
        ) {
            return true;
        }
        return false;
    }

    /// @notice See {IBentureDex-buyMarket}
    function buyMarket(
        address tokenA,
        address tokenB,
        uint256 amount,
        uint256 slippage,
        uint256 nonce,
        bytes memory signature
    ) external nonReentrant updateQuotes(tokenA, tokenB) {
        // Verify signature
        {
            bytes32 txHash = _getTxHashMarket(
                tokenA,
                tokenB,
                amount,
                slippage,
                nonce
            );
            if (_executed[txHash]) revert TxAlreadyExecuted(txHash);
            if (!_verifyBackendSignature(signature, txHash))
                revert InvalidSignature();
            // Mark that tx with a calculated hash was executed
            // Do it before function body to avoid reentrancy
            _executed[txHash] = true;
        }

        Order memory order = _prepareOrder(
            tokenA,
            tokenB,
            amount,
            0,
            OrderType.Market,
            OrderSide.Buy,
            slippage,
            false
        );

        // No market orders can be created if market price is 0
        _checkZeroPrice(order.tokenA, order.tokenB);

        uint256 lockAmount = _getLockAmount(
            order.tokenA,
            order.tokenB,
            order.amount,
            _getPrice(tokenA, tokenB)
        );

        uint256 feeAmount = _getFee(lockAmount);

        // Mark that fee for new order was paid in `tokenB`
        _tokensToFeesIds[tokenB].push(order.id);

        // Mark that `tokenB` was locked
        _lockedTokens.add(tokenB);

        // Set the real fee and lock amounts
        order.feeAmount = feeAmount;

        _createOrder(order, lockAmount);
    }

    /// @notice See {IBentureDex-sellMarket}
    function sellMarket(
        address tokenA,
        address tokenB,
        uint256 amount,
        uint256 slippage,
        uint256 nonce,
        bytes memory signature
    ) external nonReentrant updateQuotes(tokenA, tokenB) {
        // Verify signature
        {
            bytes32 txHash = _getTxHashMarket(
                tokenA,
                tokenB,
                amount,
                slippage,
                nonce
            );
            if (_executed[txHash]) revert TxAlreadyExecuted(txHash);
            if (!_verifyBackendSignature(signature, txHash))
                revert InvalidSignature();
            // Mark that tx with a calculated hash was executed
            // Do it before function body to avoid reentrancy
            _executed[txHash] = true;
        }

        Order memory order = _prepareOrder(
            tokenA,
            tokenB,
            amount,
            0,
            OrderType.Market,
            OrderSide.Sell,
            slippage,
            false
        );

        // No market orders can be created if market price is 0
        _checkZeroPrice(order.tokenA, order.tokenB);

        // User has to lock exactly the amount of `tokenB` he is selling
        uint256 lockAmount = amount;

        // Calculate the fee amount for the order
        uint256 feeAmount = _getFee(lockAmount);

        // Mark that fee for new order was paid in `tokenB`
        _tokensToFeesIds[tokenB].push(order.id);

        // Mark that `tokenB` was locked
        _lockedTokens.add(tokenB);

        // Set the real fee and lock amounts
        order.feeAmount = feeAmount;

        _createOrder(order, lockAmount);
    }

    /// @notice See {IBentureDex-buyLimit}
    function buyLimit(
        address tokenA,
        address tokenB,
        uint256 amount,
        uint256 limitPrice
    ) external nonReentrant updateQuotes(tokenA, tokenB) {
        Order memory order = _prepareOrder(
            tokenA,
            tokenB,
            amount,
            limitPrice,
            OrderType.Limit,
            OrderSide.Buy,
            0,
            // Orders are cancellable
            true
        );

        _updatePairPriceOnLimit(order);

        uint256 marketPrice = _getPrice(order.tokenA, order.tokenB);

        uint256 lockAmount;
        // If user wants to create a buy limit order with limit price much higher
        // than the market price, then this order will instantly be matched with
        // other limit (sell) orders that have a lower limit price
        // In this case not the whole locked amount of tokens will be used and the rest
        // should be returned to the user. We can avoid that by locking the amount of
        // tokens according to the market price instead of limit price of the order
        // We can think of this order as a market order
        if (limitPrice > marketPrice) {
            lockAmount = _getLockAmount(tokenA, tokenB, amount, marketPrice);
        } else {
            lockAmount = _getLockAmount(tokenA, tokenB, amount, limitPrice);
        }

        uint256 feeAmount = _getFee(lockAmount);

        // Mark that fee for new order was paid in `tokenB`
        _tokensToFeesIds[tokenB].push(order.id);

        // Mark that `tokenB` was locked
        _lockedTokens.add(tokenB);

        // Set the real fee and lock amounts
        order.feeAmount = feeAmount;

        _createOrder(order, lockAmount);
    }

    /// @notice See {IBentureDex-sellLimit}
    function sellLimit(
        address tokenA,
        address tokenB,
        uint256 amount,
        uint256 limitPrice
    ) public nonReentrant updateQuotes(tokenA, tokenB) {
        Order memory order = _prepareOrder(
            tokenA,
            tokenB,
            amount,
            limitPrice,
            OrderType.Limit,
            OrderSide.Sell,
            0,
            // Orders are cancellable
            true
        );

        _updatePairPriceOnLimit(order);

        // User has to lock exactly the amount of `tokenB` he is selling
        uint256 lockAmount = amount;

        // Calculate the fee amount for the order
        uint256 feeAmount = _getFee(lockAmount);

        // Mark that fee for new order was paid in `tokenB`
        _tokensToFeesIds[tokenB].push(order.id);

        // Mark that `tokenB` was locked
        _lockedTokens.add(order.tokenB);

        // Set the real fee and lock amounts
        order.feeAmount = feeAmount;

        _createOrder(order, lockAmount);
    }

    /// @notice See {IBentureDex-cancelOrder}
    function cancelOrder(uint256 id) external nonReentrant {
        _cancelOrder(id);
    }

    /// @notice See {IBentureDex-setFee}
    function setFee(uint256 newFeeRate) external onlyOwner {
        if (newFeeRate == feeRate) revert SameFee();
        emit FeeRateChanged(feeRate, newFeeRate);
        feeRate = newFeeRate;
    }

    /// @notice See {IBentureDex-checkOrderExists}
    function checkOrderExists(uint256 id) public view returns (bool) {
        if (id > _orderId.current()) {
            return false;
        }
        // No native tokens can be bought
        // If `tokenA` address is zero address, that means this is a Default
        // value of address, and that means that orders was not created yet
        if (_orders[id].tokenA == address(0)) {
            return false;
        }
        return true;
    }

    /// @notice See {IBentureDex-withdrawFees}
    function withdrawFees(address[] memory tokens) public onlyOwner {
        // The amount of gas spent for all operations below
        uint256 gasSpent = 0;
        // Only 2/3 of block gas limit could be spent.
        uint256 gasThreshold = (block.gaslimit * 2) / 3;
        uint256 lastGasLeft = gasleft();

        for (uint256 i = 0; i < tokens.length; i++) {
            address lockedToken = tokens[i];
            if (lockedToken == address(0)) revert ZeroAddress();
            // IDs of orders fees for which were paid in this token
            uint256[] memory ids = _tokensToFeesIds[lockedToken];
            for (uint256 j = 0; j < ids.length; j++) {
                Order storage order = _orders[ids[j]];
                // Only fees of closed orders can be withdrawn
                if (order.status != OrderStatus.Closed)
                    revert InvalidStatusForFees();
                uint256 transferAmount = order.feeAmount;

                emit FeesWithdrawn(lockedToken, transferAmount);

                // Transfer all withdraw fees to the owner
                IERC20(lockedToken).safeTransfer(msg.sender, transferAmount);

                lastGasLeft = gasleft();
                // Increase the total amount of gas spent
                gasSpent += lastGasLeft - gasleft();
                // Check that no more than 2/3 of block gas limit was spent
                if (gasSpent >= gasThreshold) {
                    emit GasLimitReached(gasSpent, block.gaslimit);
                    break;
                }
            }
        }
    }

    /// @notice See {IBentureDex-withdrawAllFees}
    function withdrawAllFees() external onlyOwner {
        if (_lockedTokens.values().length == 0) revert NoFeesToWithdraw();
        // Get the list of all locked tokens and withdraw fees
        // for each of them
        withdrawFees(_lockedTokens.values());
    }

    /// @notice See {IBentureDex-startSaleSingle}
    function startSaleSingle(
        address tokenA,
        address tokenB,
        uint256 amount,
        uint256 price
    ) public nonReentrant {
        // Prevent reentrancy
        _startSaleSingle(tokenA, tokenB, amount, price);
    }

    /// @notice See {IBentureDex-startSaleMultiple}
    function startSaleMultiple(
        address tokenA,
        address tokenB,
        uint256[] memory amounts,
        uint256[] memory prices
    ) external nonReentrant {
        if (amounts.length != prices.length) revert DifferentLength();

        // The amount of gas spent for all operations below
        uint256 gasSpent = 0;
        // Only 2/3 of block gas limit could be spent.
        uint256 gasThreshold = (block.gaslimit * 2) / 3;
        uint256 lastGasLeft = gasleft();

        for (uint256 i = 0; i < amounts.length; i++) {
            _startSaleSingle(tokenA, tokenB, amounts[i], prices[i]);

            lastGasLeft = gasleft();
            // Increase the total amount of gas spent
            gasSpent += lastGasLeft - gasleft();
            // Check that no more than 2/3 of block gas limit was spent
            if (gasSpent >= gasThreshold) {
                emit GasLimitReached(gasSpent, block.gaslimit);
                break;
            }
        }

        // SaleStarted event is emitted for each sale from the list
        // No need to emit any other events here
    }

    /// @notice See {IBentureDex-matchOrders}
    function matchOrders(
        uint256 initId,
        uint256[] memory matchedIds,
        uint256 nonce,
        bytes calldata signature
    ) external nonReentrant {
        _matchOrders(initId, matchedIds, nonce, signature);
    }

    /// @notice See {IBentureDex-setBackend}
    function setBackend(address acc) external onlyOwner {
        if (acc == backendAcc) revert SameBackend();
        if (acc == address(0)) revert ZeroAddress();
        backendAcc = acc;
    }

    function _createOrder(Order memory order, uint256 lockAmount) private {
        // Mark that new ID corresponds to the pair of tokens
        _tokensToOrders[order.tokenA][order.tokenB].push(order.id);

        // NOTICE: Order with ID1 has index 0
        _usersToOrders[msg.sender].push(order.id);

        emit OrderCreated(
            order.id,
            order.user,
            order.tokenA,
            order.tokenB,
            order.amount,
            order.type_,
            order.side,
            order.limitPrice,
            order.isCancellable
        );

        // Place order in the global list
        _orders[order.id] = order;

        // Entire lock consists of lock amount and fee amount
        uint256 totalLock = lockAmount + order.feeAmount;

        _orders[order.id].amountLocked = lockAmount;

        // In any case, `tokenB` is the one that is locked.
        // It gets transferred to the contract
        // Fee is also paid in `tokenB`
        // Fee gets transferred to the contract
        IERC20(order.tokenB).safeTransferFrom(
            msg.sender,
            address(this),
            totalLock
        );
    }

    function _cancelOrder(uint256 id) private {
        if (!checkOrderExists(id)) revert OrderDoesNotExist();
        Order storage order = _orders[id];
        if (order.status == OrderStatus.Active) {}
        if (!order.isCancellable) revert NonCancellable();
        // Partially closed orders can be cancelled as well
        if (
            !(order.status == OrderStatus.Active) &&
            !(order.status == OrderStatus.PartiallyClosed)
        ) revert InvalidOrderStatus();
        if (msg.sender != order.user) revert NotOrderCreator();
        // The amount of tokens to be returned to the user
        uint256 returnAmount;
        if (order.status == OrderStatus.Active) {
            // If order was not executed at all, whole lock and fee should
            // be returned
            returnAmount = order.amountLocked + order.feeAmount;
            // Order fee resets
            order.feeAmount = 0;
            // Order locked amount resets
            order.amountLocked = 0;
        } else {
            // It order was partially executed, the part of the fee proportional
            // to the filled amount should be returned as well
            uint256 returnFee = _calcReturnFee(order);
            returnAmount = order.amountLocked + returnFee;
            // Order fee amount decreases by the returned amount
            order.feeAmount -= returnFee;
            // Order locked amount resets
            order.amountLocked = 0;
        }

        emit OrderCancelled(order.id);

        // Only the status of the order gets changed
        // The order itself does not get deleted
        order.status = OrderStatus.Cancelled;

        // Only `tokenB` gets locked when creating an order.
        // Thus, only `tokenB` should be returned to the user
        IERC20(order.tokenB).safeTransfer(order.user, returnAmount);
    }

    function _matchOrders(
        uint256 initId,
        uint256[] memory matchedIds,
        uint256 nonce,
        bytes calldata signature
    ) private {
        // Verify signature
        {
            bytes32 txHash = _getTxHashMatch(initId, matchedIds, nonce);
            if (_executed[txHash]) revert TxAlreadyExecuted(txHash);
            if (!_verifyBackendSignature(signature, txHash))
                revert InvalidSignature();
            // Mark that tx with a calculated hash was executed
            // Do it before function body to avoid reentrancy
            _executed[txHash] = true;
        }

        // NOTICE: No other checks are done here. Fully trust the backend

        // The amount of gas spent for all operations below
        uint256 gasSpent = 0;
        // Only 2/3 of block gas limit could be spent.
        uint256 lastGasLeft = gasleft();

        Order memory initOrder = _orders[initId];

        for (uint256 i = 0; i < matchedIds.length; i++) {
            Order memory matchedOrder = _orders[matchedIds[i]];

            emit OrdersMatched(initOrder.id, matchedOrder.id);

            // Mark that both orders matched
            _matchedOrders[initOrder.id][matchedOrder.id] = true;
            _matchedOrders[matchedOrder.id][initOrder.id] = true;

            // Get tokens and amounts to transfer
            (
                address tokenToInit,
                address tokenToMatched,
                uint256 amountToInit,
                uint256 amountToMatched
            ) = _getAmounts(
                    initOrder,
                    matchedOrder,
                    // Price of the executed limit order
                    _getNewPrice(initOrder, matchedOrder)
                );

            // Revert if slippage is too big for any of the orders
            // Slippage is only allowed for market orders.
            // Only initial orders can be market
            if (initOrder.type_ == OrderType.Market) {
                _checkSlippage(
                    // Old price of the pair before orders execution
                    // Expressed in pair's quoted tokens
                    _getPrice(initOrder.tokenA, initOrder.tokenB),
                    _getNewPrice(initOrder, matchedOrder),
                    matchedOrder.slippage
                );
            }

            // Pair price gets updated to the price of the last executed limit order
            _updatePairPrice(initOrder, matchedOrder);

            // Change filled and locked amounts of two matched orders
            _updateOrdersAmounts(
                initOrder,
                matchedOrder,
                amountToInit,
                amountToMatched
            );

            // Change orders' statuses according to their filled amounts
            _checkAndChangeStatus(initOrder);
            _checkAndChangeStatus(matchedOrder);

            // Actually transfer corresponding amounts
            IERC20(tokenToInit).safeTransfer(initOrder.user, amountToInit);

            IERC20(tokenToMatched).safeTransfer(
                matchedOrder.user,
                amountToMatched
            );

            lastGasLeft = gasleft();
            // Increase the total amount of gas spent
            gasSpent += lastGasLeft - gasleft();
            // Check that no more than 2/3 of block gas limit was spent
            if (gasSpent >= (block.gaslimit * 2) / 3) {
                emit GasLimitReached(gasSpent, block.gaslimit);
                // No revert here. Part of changes will take place
                break;
            }
        }
    }

    /// @dev Calculates fee based on the amount of locked tokens
    /// @param amount The amount of locked tokens
    /// @return retAmount The fee amount that should be paid for order creation
    function _getFee(uint256 amount) private view returns (uint256) {
        return (amount * feeRate) / HUNDRED_PERCENT;
    }

    /// @dev Returns the price of the pair in quoted tokens
    /// @param tokenA The address of the token that is received
    /// @param tokenB The address of the token that is sold
    /// @return The price of the pair in quoted tokens
    function _getPrice(
        address tokenA,
        address tokenB
    ) private view returns (uint256) {
        if (_isQuoted[tokenA][tokenB]) {
            return _pairPrices[tokenA][tokenB];
        } else {
            return _pairPrices[tokenB][tokenA];
        }
    }

    /// @dev Calculates the hash of parameters of order matching function and a nonce
    /// @param initId The ID of first matched order
    /// @param matchedIds The list of IDs of other matched orders
    /// @param nonce The unique integer
    /// @dev NOTICE: Backend must form tx hash exactly the same way
    function _getTxHashMatch(
        uint256 initId,
        uint256[] memory matchedIds,
        uint256 nonce
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    // Include the address of the contract to make hash even more unique
                    address(this),
                    initId,
                    matchedIds,
                    nonce
                )
            );
    }

    /// @dev Calculates the hash of parameters of market order function and a nonce
    /// @param tokenA The address of the purchased token
    /// @param tokenB The address of the sold token
    /// @param amount The amound of purchased / sold tokens
    /// @param slippage The maximum allowed price slippage
    /// @param nonce The unique integer
    /// @dev NOTICE: Backend must form tx hash exactly the same way
    function _getTxHashMarket(
        address tokenA,
        address tokenB,
        uint256 amount,
        uint256 slippage,
        uint256 nonce
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    address(this),
                    tokenA,
                    tokenB,
                    amount,
                    slippage,
                    nonce
                )
            );
    }

    /// @dev Verifies that message was signed by the backend
    /// @param signature A signature used to sign the tx
    /// @param txHash An unsigned hashed data
    /// @return True if tx was signed by the backend. Otherwise false.
    function _verifyBackendSignature(
        bytes memory signature,
        bytes32 txHash
    ) private view returns (bool) {
        // Remove the "\x19Ethereum Signed Message:\n" prefix from the signature
        bytes32 clearHash = txHash.toEthSignedMessageHash();
        // Recover the address of the user who signed the tx
        address recoveredUser = clearHash.recover(signature);
        return recoveredUser == backendAcc;
    }

    /// @dev Returns the price of the limit order to be used
    ///      to execute orders after matching
    /// @param initOrder The first matched order
    /// @param matchedOrder The second matched order
    /// @return The execution price for orders matching
    /// @dev One of two orders must be a limit order
    function _getNewPrice(
        Order memory initOrder,
        Order memory matchedOrder
    ) private pure returns (uint256) {
        // Price of the limit order used to calculate transferred amounts later.
        // Market orders are executed using this price
        // Expressed in pair's quoted tokens
        uint256 price;
        // In case two limit orders match, the one with a smaller amount will be fully closed first
        // so its price should be used
        if (initOrder.type_ == OrderType.Limit) {
            if (
                initOrder.amount - initOrder.amountFilled <
                matchedOrder.amount - matchedOrder.amountFilled
            ) {
                price = initOrder.limitPrice;
            } else if (
                initOrder.amount - initOrder.amountFilled >
                matchedOrder.amount - matchedOrder.amountFilled
            ) {
                price = matchedOrder.limitPrice;
            } else if (
                // If both limit orders have the same amount, the one
                // that was created later is used to set a new price
                initOrder.amount - initOrder.amountFilled ==
                matchedOrder.amount - matchedOrder.amountFilled
            ) {
                price = initOrder.limitPrice;
            }

            // In case a limit and a market orders match, market order gets executed
            // with price of a limit order
        } else {
            price = matchedOrder.limitPrice;
        }
        return price;
    }

    /// @dev Checks that market price is not zero and reverts otherwise
    /// @param tokenA The first token of the pair
    /// @param tokenB The second token of the pair
    function _checkZeroPrice(address tokenA, address tokenB) private view {
        // The price of the pair in quoted tokens
        uint256 marketPrice = _getPrice(tokenA, tokenB);
        // If market price is 0 that means no limit orders have been created or matched
        // yet. In this case no market orders can be created.
        if (marketPrice == 0) revert ZeroPrice();
    }

    /// @dev Updates pair price for the price of limit order
    ///      This limit order is the first limit order created
    /// @param order The order updating price
    function _updatePairPriceOnLimit(Order memory order) private {
        uint256 marketPrice = _getPrice(order.tokenA, order.tokenB);
        // If market price is 0, that means this is the first limit order created.
        // Its price becomes the market price
        if (marketPrice == 0) {
            if (_isQuoted[order.tokenA][order.tokenB]) {
                _pairPrices[order.tokenA][order.tokenB] = order.limitPrice;

                emit PriceChanged(order.tokenA, order.tokenB, order.limitPrice);
            } else {
                _pairPrices[order.tokenB][order.tokenA] = order.limitPrice;

                emit PriceChanged(order.tokenB, order.tokenA, order.limitPrice);
            }
        }
    }

    /// @dev Changes order's status according to its filled amount
    /// @param order The order to change status of
    function _checkAndChangeStatus(Order memory order) private {
        Order storage order_ = _orders[order.id];
        if (
            order_.status == OrderStatus.Cancelled ||
            order_.status == OrderStatus.Closed
        ) revert InvalidOrderStatus();
        // TODO == of >= here?
        if (order_.amountFilled == order_.amount) {
            order_.status = OrderStatus.Closed;
        } else {
            order_.status = OrderStatus.PartiallyClosed;
        }
    }

    /// @dev Calculates the amount of tokens to transfer to seller and buyer after
    ///      orders match
    /// @param initOrder The first of matched orders
    /// @param matchedOrder The second of matched orders
    /// @param price The execution price of limit order
    function _getAmounts(
        Order memory initOrder,
        Order memory matchedOrder,
        uint256 price
    ) private view returns (address, address, uint256, uint256) {
        // The address of the token to transfer to the user of `initOrder`
        address tokenToInit;
        // The address of the token to transfer to the user of `matchedOrder`
        address tokenToMatched;
        // The amount to be transferred to the user of `initOrder`
        uint256 amountToInit;
        // The amount to be transferred to the user of `mathcedOrder`
        uint256 amountToMatched;

        // Indicates that pair price is expressed in `initOrder.tokenB`
        // If `price` is expressed in `tokenB` of the `initOrder` then it should be used when transferring
        // But if it's expressed in `tokenA` of the `initOrder` then is should be inversed when transferring
        bool quotedInInitB;
        if (_isQuoted[initOrder.tokenA][initOrder.tokenB]) {
            quotedInInitB = true;
        } else {
            quotedInInitB = false;
        }

        tokenToInit = initOrder.tokenA;
        tokenToMatched = initOrder.tokenB;

        if (initOrder.side == OrderSide.Buy) {
            // When trying to buy more than available in matched order, whole availabe amount of matched order
            // gets transferred (it's less)

            if (
                initOrder.amount - initOrder.amountFilled >
                matchedOrder.amount - matchedOrder.amountFilled
            ) {
                // Sell all seller's tokens to the buyer
                // Amount of buy order tokenA trasferred from sell to buy order
                amountToInit = matchedOrder.amount - matchedOrder.amountFilled;

                // Pay seller according to amount of tokens he sells
                if (quotedInInitB) {
                    // Transfer `price` times more tokenB from buy to sell order
                    amountToMatched = (amountToInit * price) / PRICE_PRECISION;
                } else {
                    amountToMatched = (amountToInit * PRICE_PRECISION) / price;
                }
            } else {
                // When trying to buy less or equal to what is available in matched order, only bought amount
                // gets transferred (it's less). Some amount stays locked in the matched order

                // Buy exactly the amount of tokens buyer wants to buy
                // Amount of buy order tokenA transferred from sell to buy order
                amountToInit = initOrder.amount - initOrder.amountFilled;

                // Pay the seller according to the amount the buyer purchases
                if (quotedInInitB) {
                    // Transfer `price` times more tokenB from buy to sell order
                    amountToMatched = (amountToInit * price) / PRICE_PRECISION;
                } else {
                    amountToMatched = (amountToInit * PRICE_PRECISION) / price;
                }
            }
        }
        if (initOrder.side == OrderSide.Sell) {
            // When trying to sell more tokens than buyer can purchase, only transfer to him the amount
            // he can purchase

            if (
                initOrder.amount - initOrder.amountFilled >
                matchedOrder.amount - matchedOrder.amountFilled
            ) {
                // Give buyer all tokens he wants to buy
                // Amount of sell order tokenB transferred from sell to buy order
                amountToMatched =
                    matchedOrder.amount -
                    matchedOrder.amountFilled;

                // Buyer pays for tokens transferred to him
                if (quotedInInitB) {
                    // Transfer `price` less times tokenA from buy to sell order
                    amountToInit = (amountToMatched * PRICE_PRECISION) / price;
                } else {
                    amountToInit = (amountToMatched * price) / PRICE_PRECISION;
                }
            } else {
                // When trying to sell less tokens than buyer can purchase, whole available amount of sold
                // tokens gets transferred to the buyer

                // Give buyer all tokens seller wants to sell
                // Amount of sell order tokenB transferred from sell to buy order
                amountToMatched = initOrder.amount - initOrder.amountFilled;

                // Buyer pays for tokens transferred to him
                if (quotedInInitB) {
                    // Transfer `price` less times tokenA from buy to sell order
                    amountToInit = (amountToMatched * PRICE_PRECISION) / price;
                } else {
                    amountToInit = (amountToMatched * price) / PRICE_PRECISION;
                }
            }
        }

        return (tokenToInit, tokenToMatched, amountToInit, amountToMatched);
    }

    /// @dev Calculates price slippage in basis points
    /// @param oldPrice Old price of pair of tokens
    /// @param newPrice New price of pair of tokens
    /// @return Price slippage in basis points
    function _calcSlippage(
        uint256 oldPrice,
        uint256 newPrice
    ) private pure returns (uint256) {
        uint256 minPrice = newPrice > oldPrice ? oldPrice : newPrice;
        uint256 maxPrice = newPrice > oldPrice ? newPrice : oldPrice;
        uint256 priceDif = maxPrice - minPrice;
        uint256 slippage = (priceDif * HUNDRED_PERCENT) / maxPrice;
        return slippage;
    }

    /// @dev Checks that price slippage is not too high
    /// @param oldPrice Old price of the pair
    /// @param newPrice New price of the pair
    /// @param allowedSlippage The maximum allowed slippage in basis points
    function _checkSlippage(
        uint256 oldPrice,
        uint256 newPrice,
        uint256 allowedSlippage
    ) private pure {
        uint256 slippage = _calcSlippage(oldPrice, newPrice);
        if (slippage > allowedSlippage) {
            revert SlippageTooBig(slippage);
        }
    }

    /// @dev Forms args structure to be used in `_createOrder` function later.
    ///      Avoids the `Stack too deep` error
    /// @param tokenA The address of the token that is purchased
    /// @param tokenB The address of the token that is sold
    /// @param amount The amount of active tokens
    /// @param limitPrice The limit price of the order in quoted tokens
    /// @param type_ The type of the order
    /// @param side The side of the order
    /// @param slippage The slippage of market order
    /// @param isCancellable True if order is cancellable. Otherwise - false
    function _prepareOrder(
        address tokenA,
        address tokenB,
        uint256 amount,
        uint256 limitPrice,
        OrderType type_,
        OrderSide side,
        uint256 slippage,
        bool isCancellable
    ) private returns (Order memory) {
        if (tokenA == address(0)) revert InvalidFirstTokenAddress();
        if (amount == 0) revert ZeroAmount();

        // NOTICE: first order gets the ID of 1
        _orderId.increment();
        uint256 id = _orderId.current();

        Order memory order = Order({
            id: id,
            user: msg.sender,
            tokenA: tokenA,
            tokenB: tokenB,
            amount: amount,
            // Initial amount is always 0
            amountFilled: 0,
            type_: type_,
            side: side,
            // Limit price is 0 for market orders
            limitPrice: limitPrice,
            slippage: slippage,
            isCancellable: isCancellable,
            status: OrderStatus.Active,
            // Leave 0 for lockAmount and feeAmount for now
            feeAmount: 0,
            amountLocked: 0
        });

        return order;
    }

    /// @dev Updates price of tokens pair
    /// @param initOrder The first matched order
    /// @param matchedOrder The second matched order
    function _updatePairPrice(
        Order memory initOrder,
        Order memory matchedOrder
    ) private {
        // Indicates that pair price is expressed in `initOrder.tokenB`
        // If `price` is expressed in `tokenB` of the `initOrder` then it should be used when transferring
        // But if it's expressed in `tokenA` of the `initOrder` then is should be inversed when transferring
        bool quotedInInitB;
        if (_isQuoted[initOrder.tokenA][initOrder.tokenB]) {
            quotedInInitB = true;
        } else {
            quotedInInitB = false;
        }

        if (quotedInInitB) {
            _pairPrices[initOrder.tokenA][initOrder.tokenB] = _getNewPrice(
                initOrder,
                matchedOrder
            );

            emit PriceChanged(
                initOrder.tokenA,
                initOrder.tokenB,
                _getNewPrice(initOrder, matchedOrder)
            );
        } else {
            _pairPrices[initOrder.tokenB][initOrder.tokenA] = _getNewPrice(
                initOrder,
                matchedOrder
            );

            emit PriceChanged(
                initOrder.tokenB,
                initOrder.tokenA,
                _getNewPrice(initOrder, matchedOrder)
            );
        }
    }

    /// @dev Updates locked and filled amounts of orders
    /// @param initOrder The first matched order
    /// @param matchedOrder The second matched order
    /// @param amountToInit The amount of active tokens transferred to `initOrder`
    /// @param amountToMatched The amount of active tokens transferred to `matchedOrder`
    function _updateOrdersAmounts(
        Order memory initOrder,
        Order memory matchedOrder,
        uint256 amountToInit,
        uint256 amountToMatched
    ) private {
        if (
            initOrder.side == OrderSide.Buy &&
            matchedOrder.side == OrderSide.Sell
        ) {
            // Bought tokens increment filled amount of buy order
            _orders[initOrder.id].amountFilled += amountToInit;
            // Bought tokens increment filled amount of sell order
            _orders[matchedOrder.id].amountFilled += amountToInit;
            // Bought tokens decrement locked amount of sell order
            _orders[matchedOrder.id].amountLocked -= amountToInit;
            // Sold tokens decrement locked amount of buy order
            _orders[initOrder.id].amountLocked -= amountToMatched;
        } else {
            // Sold tokens increment filled amount of buy order
            _orders[matchedOrder.id].amountFilled += amountToMatched;
            // Sold tokens increment filled amount of sell order
            _orders[initOrder.id].amountFilled += amountToMatched;
            // Sold tokens decrement locked amount of sell order
            _orders[initOrder.id].amountLocked -= amountToMatched;
            // Bought tokens decrement locked amount of buy order
            _orders[matchedOrder.id].amountLocked -= amountToInit;
        }
    }

    /// @dev Calculates the amount of tokens to be locked when creating an order
    /// @param tokenA The address of the token that is purchased
    /// @param tokenB The address of the token that is sold
    /// @param amount The amount of active tokens
    /// @param price The market/limit execution price
    /// @return The amount of tokens to be locked
    function _getLockAmount(
        address tokenA,
        address tokenB,
        uint256 amount,
        uint256 price
    ) private view returns (uint256) {
        uint256 lockAmount;

        if (_isQuoted[tokenA][tokenB]) {
            // User has to lock enough `tokenB_` to pay according to current price
            // If `tokenB_` is a quoted token, then `price` does not change
            // because it's expressed in this token
            lockAmount = (amount * price) / PRICE_PRECISION;
        } else {
            // If `tokenA_` is a quoted token, then `price` should be inversed
            lockAmount = (amount * PRICE_PRECISION) / price;
        }

        return lockAmount;
    }

    /// @dev Calculates fee amount to be returned based
    ///      on the filled amount of the cancelled order
    /// @param order The cancelled order
    /// @return The fee amount to return to the user
    function _calcReturnFee(Order memory order) private pure returns (uint256) {
        return
            order.feeAmount -
            ((order.amountFilled * order.feeAmount) / order.amount);
    }

    function _startSaleSingle(
        address tokenA,
        address tokenB,
        uint256 amount,
        uint256 price
    ) private {
        // Only admin of the sold token `tokenB` project can start the ICO of tokens
        if (!IBentureProducedToken(tokenB).checkAdmin(msg.sender))
            revert NotAdmin();

        emit SaleStarted(tokenA, tokenB, amount, price);

        Order memory order = _prepareOrder(
            tokenA,
            tokenB,
            amount,
            price,
            OrderType.Limit,
            OrderSide.Sell,
            0,
            // Orders are NON-cancellable
            false
        );

        _updatePairPriceOnLimit(order);

        // User has to lock exactly the amount of `tokenB` he is selling
        uint256 lockAmount = amount;

        // Calculate the fee amount for the order
        uint256 feeAmount = _getFee(lockAmount);

        // Mark that fee for new order was paid in `tokenB`
        _tokensToFeesIds[tokenB].push(order.id);

        // Mark that `tokenB` was locked
        _lockedTokens.add(order.tokenB);

        // Set the real fee and lock amounts
        order.feeAmount = feeAmount;

        _createOrder(order, lockAmount);
    }
}
