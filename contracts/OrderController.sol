// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./interfaces/IOrderController.sol";
import "./interfaces/IBentureProducedToken.sol";

/// @title Contract that controlls creation and execution of market and limit orders
contract OrderController is IOrderController, Ownable, ReentrancyGuard {
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
    mapping(uint256 => mapping(uint256 => bool)) private matchedOrders;
    /// @dev Mapping from user address to the array of orders IDs he created
    mapping(address => uint256[]) private _usersToOrders;
    /// @dev Mapping from pair tokens addresses to the list of IDs with these tokens
    mapping(address => mapping(address => uint[])) private tokensToOrders;
    /// @dev Mapping from one token to another to boolean indicating
    ///      that the second tokens is quoated (the price of the first
    ///      is measured in the amount of second tokens)
    mapping(address => mapping(address => bool)) private isQuoted;
    /// @dev Mapping from unquoted token of the pair to the quoted
    ///      token of the pair to the price (how many quoted tokens
    ///      to pay for a single unquoted token)
    ///      .e.g (USDT => DOGE => 420)
    ///      Each price is multiplied by `PRICE_PRECISION`
    mapping(address => mapping(address => uint256)) private pairPrices;
    /// @dev Mapping from locked token addresses to the amount of
    ///         fees collected with them
    mapping(address => uint256) private tokenFees;
    /// @dev List of tokens that are currently locked as fees
    ///         for orders creations
    EnumerableSet.AddressSet private lockedTokens;
    /// @notice Marks transaction hashes that have been executed already.
    ///         Prevents Replay Attacks
    mapping(bytes32 => bool) public executed;

    /// @dev 100% in basis points (1 bp = 1 / 100 of 1%)
    uint256 private constant HUNDRED_PERCENT = 10000;

    /// @dev Allows to executed only transactions signed by backend
    modifier onlyBackend(uint256 nonce, bytes memory signature) {
        // Calculate tx hash. Include some function parameters and nonce to
        // avoid Replay Attacks
        bytes32 txHash = getTxHash(nonce);
        require(!executed[txHash], "OC: Tx already executed!");
        require(
            _verifyBackendSignature(signature, txHash),
            "OC: Only backend can call this function!"
        );
        // Mark that tx with a calculated hash was executed
        // Do it before function body to avoid reentrancy
        executed[txHash] = true;
        _;
    }

    /// @notice Sets the inital fee rate for orders
    constructor() {
        // Default fee rate is 0.1% (10 BP)
        feeRate = 10;
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
            order.amount,
            order.amountCurrent,
            order.type_,
            order.side,
            order.limitPrice,
            order.isCancellable,
            order.status
        );
    }

    /// @notice See {IOrderController-getOrdersByTokens}
    function getOrdersByTokens(
        address tokenA,
        address tokenB
    ) external view returns (uint256[] memory) {
        require(tokenA != address(0), "OC: Cannot buy native tokens!");
        return tokensToOrders[tokenA][tokenB];
    }

    /// @notice See (IOrderController-checkMatched)
    function checkMatched(
        uint256 firstId,
        uint256 secondId
    ) external view returns (bool) {
        require(checkOrderExists(firstId), "OC: Order does not exist!");
        require(checkOrderExists(secondId), "OC: Order does not exist!");
        if (
            matchedOrders[firstId][secondId] || matchedOrders[secondId][firstId]
        ) {
            return true;
        }
        return false;
    }

    // TODO place it all into interface
    function buyMarket(
        address tokenA,
        address tokenB,
        uint256 amount,
        uint256 slippage,
        uint256 nonce,
        bytes calldata signature
    ) external nonReentrant {

        // Form args structure to pass it to `createOrder` function later
        OrderArgs memory args = OrderArgs(
            tokenA,
            tokenB,
            amount,
            // Initial amount is always 0
            0,
            OrderType.Market,
            OrderSide.Buy,
            // Limit price is 0 for market orders
            0,
            slippage,
            // Leave 0 for lockAmount and feeAmount for now
            0,
            0,
            false,
            nonce,
            signature
        );

        require(args.tokenA != address(0), "OC: Cannot buy native tokens!");
        require(args.amount != 0, "OC: Cannot buy/sell zero tokens!");

        // If none of the tokens is quoted, `tokenB_` becomes a quoted token
        if (!isQuoted[args.tokenA][args.tokenB] && !isQuoted[args.tokenB][args.tokenA]) {
            isQuoted[args.tokenA][args.tokenB] = true;
        }

        // The price of the pair in quoted tokens
        uint256 price = getPrice(args.tokenA, args.tokenB);

        uint256 lockAmount;

        // User has to lock enough `tokenB_` to pay according to current price
        if (isQuoted[args.tokenA][args.tokenB]) {
            // If `tokenB_` is a quoted token, then `price` does not change
            // because it's expressed in this token
            lockAmount = (args.amount * price) / PRICE_PRECISION;
        } else {
            // If `tokenA_` is a quoted token, then `price` should be inversed
            lockAmount = (args.amount * PRICE_PRECISION) / price;
        }

        uint256 feeAmount = _getFee(lockAmount);

        // Mark that fee amount of `tokenB_` was increased
        tokenFees[args.tokenB] += feeAmount;
        lockedTokens.add(args.tokenB);

        // Set the real fee and lock amounts
        args.feeAmount = feeAmount;
        args.lockAmount = lockAmount;

        _createOrderMinimal(
            args
        );

    }

    function sellMarket(
        address tokenA,
        address tokenB,
        uint256 amount,
        uint256 slippage,
        uint256 nonce,
        bytes calldata signature
    ) external {

        // Form args structure to pass it to `createOrder` function later
        OrderArgs memory args = OrderArgs(
            tokenA,
            tokenB,
            amount,
            // Initial amount is always 0
            0,
            OrderType.Market,
            OrderSide.Sell,
            // Limit price is 0 for market orders
            0,
            slippage,
            // Leave 0 for lockAmount and feeAmount for now
            0,
            0,
            false,
            nonce,
            signature
        );

        require(args.tokenA != address(0), "OC: Cannot buy native tokens!");
        require(args.amount != 0, "OC: Cannot buy/sell zero tokens!");

        // If none of the tokens is quoted, `tokenB_` becomes a quoted token
        if (!isQuoted[args.tokenA][args.tokenB] && !isQuoted[args.tokenB][args.tokenA]) {
            isQuoted[args.tokenA][args.tokenB] = true;
        }


        uint256 lockAmount = amount;

        // Calculate the fee amount for the order
        uint256 feeAmount = _getFee(lockAmount);

        // Mark that fee amount of `tokenB` was increased
        tokenFees[args.tokenB] += feeAmount;
        lockedTokens.add(args.tokenB);

        // Set the real fee and lock amounts
        args.feeAmount = feeAmount;
        args.lockAmount = lockAmount;

        _createOrderMinimal(
            args
        );
    }

    function buyLimit() external {

    }

    function sellLimit() external {

    }

    // TODO replace it with buyMarket, sellMarket ...
    /// @notice See {IOrderController-createOrder}
    function createOrder(
        address tokenA,
        address tokenB,
        uint256 amount,
        OrderType type_,
        OrderSide side,
        uint256 limitPrice,
        uint256 slippage,
        bool isCancellable,
        uint256 nonce,
        bytes calldata signature
    ) external nonReentrant {
        _createOrder(
            tokenA,
            tokenB,
            amount,
            type_,
            side,
            limitPrice,
            slippage,
            isCancellable,
            nonce,
            signature
        );
    }

    /// @notice See {IOrderController-cancelOrder}
    function cancelOrder(
        uint256 id,
        uint256 nonce,
        bytes calldata signature
    ) external nonReentrant {
        _cancelOrder(id, nonce, signature);
    }

    /// @notice See {IOrderController-setFee}
    function setFee(uint256 newFeeRate) external onlyOwner {
        require(newFeeRate != feeRate, "OC: Fee rates must differ!");
        emit FeeRateChanged(feeRate, newFeeRate);
        feeRate = newFeeRate;
    }

    /// @notice See {IOrderController-checkOrderExists}
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

    /// @notice See {IOrderController-withdrawFees}
    function withdrawFees(address[] memory tokens) public onlyOwner {
        // The amount of gas spent for all operations below
        uint256 gasSpent = 0;
        // Only 2/3 of block gas limit could be spent.
        uint256 gasThreshold = (block.gaslimit * 2) / 3;
        uint256 lastGasLeft = gasleft();

        for (uint256 i = 0; i < tokens.length; i++) {
            address lockedToken = tokens[i];
            // Reset fees
            uint256 transferAmount = tokenFees[lockedToken];
            delete tokenFees[lockedToken];
            // Token is no longer locked
            lockedTokens.remove(lockedToken);

            emit FeesWithdrawn(lockedToken, transferAmount);

            // Transfer all withdraw fees to the owner
            IERC20(lockedToken).safeTransfer(msg.sender, transferAmount);

            // Calculate the amount of gas spent for one iteration
            uint256 gasSpentPerIteration = lastGasLeft - gasleft();
            lastGasLeft = gasleft();
            // Increase the total amount of gas spent
            gasSpent += gasSpentPerIteration;
            // Check that no more than 2/3 of block gas limit was spent
            if (gasSpent >= gasThreshold) {
                emit GasLimitReached(gasSpent, block.gaslimit);
                break;
            }
        }
    }

    /// @notice See {IOrderController-withdrawAllFees}
    function withdrawAllFees() public onlyOwner {
        require(lockedTokens.values().length > 0, "OC: No fees to withdraw!");
        // Get the list of all locked tokens and withdraw fees
        // for each of them
        withdrawFees(lockedTokens.values());
    }

    /// @notice See {IOrderController-startSaleSingle}
    function startSaleSingle(
        address tokenA,
        address tokenB,
        uint256 amount,
        uint256 price,
        uint256 nonce,
        bytes calldata signature
    ) public nonReentrant onlyBackend(nonce, signature) {
        // Only admin of the sold token `tokenB` project can start the ICO of tokens
        require(
            IBentureProducedToken(tokenB).checkAdmin(msg.sender),
            "OC: Not an admin of the project"
        );

        emit SaleStarted(tokenB);

        _createOrder(
            tokenA,
            tokenB,
            amount,
            OrderType.Limit,
            OrderSide.Sell,
            // Price is the limit where this order becomes tradeable
            price,
            // Price slippage for limit orders is always zero
            0,
            // Sale orders are non-cancellable
            false,
            nonce,
            signature
        );
    }

    /// @notice See {IOrderController-startSaleMultiple}
    function startSaleMultiple(
        address tokenA,
        address tokenB,
        uint256[] memory amounts,
        uint256[] memory prices,
        uint256 nonce,
        bytes calldata signature
    ) public nonReentrant onlyBackend(nonce, signature) {
        require(amounts.length == prices.length, "OC: Arrays length differs!");

        // The amount of gas spent for all operations below
        uint256 gasSpent = 0;
        // Only 2/3 of block gas limit could be spent.
        uint256 gasThreshold = (block.gaslimit * 2) / 3;
        uint256 lastGasLeft = gasleft();

        for (uint256 i = 0; i < amounts.length; i++) {
            startSaleSingle(
                tokenA,
                tokenB,
                amounts[i],
                prices[i],
                nonce,
                signature
            );

            // Calculate the amount of gas spent for one iteration
            uint256 gasSpentPerIteration = lastGasLeft - gasleft();
            lastGasLeft = gasleft();
            // Increase the total amount of gas spent
            gasSpent += gasSpentPerIteration;
            // Check that no more than 2/3 of block gas limit was spent
            if (gasSpent >= gasThreshold) {
                emit GasLimitReached(gasSpent, block.gaslimit);
                break;
            }
        }

        // SaleStarted event is emitted for each sale from the list
        // No need to emit any other events here
    }

    /// @notice See {IOrderController-matchOrders}
    function matchOrders(
        uint256 initId,
        uint256[] memory matchedIds,
        uint256 nonce,
        bytes calldata signature
    ) public nonReentrant {
        _matchOrders(initId, matchedIds, nonce, signature);
    }

    /// @notice See {IOrderController-setBackend}
    function setBackend(address acc) public onlyOwner {
        require(acc != backendAcc, "OC: Cannot set the same backend address!");
        require(
            acc != address(0),
            "OC: Backend address cannot be zero address!"
        );
        backendAcc = acc;
    }

    /// @dev Calculates fee based on the amount of locked tokens
    /// @param amount The amount of locked tokens
    /// @return retAmount The fee amount that should be paid for order creation
    function _getFee(uint256 amount) private view returns (uint256 retAmount) {
        retAmount = (amount * feeRate) / HUNDRED_PERCENT;
    }

    /// @dev Subtracts the fee from transferred tokens amount
    /// @param amount The amount of transferred tokens
    /// @return retAmount The transferred amount minus the fee
    function _subFee(uint256 amount) private view returns (uint256 retAmount) {
        retAmount = amount - _getFee(amount);
    }

    /// @dev Returns the price of the pair in quoted tokens
    /// @param tokenA The address of the token that is received
    /// @param tokenB The address of the token that is sold
    /// @return The price of the pair in quoted tokens
    function getPrice(
        address tokenA,
        address tokenB
    ) private view returns (uint256) {
        require(
            (isQuoted[tokenA][tokenB]) || (isQuoted[tokenB][tokenA]),
            "OC: None of tokens is quoted!"
        );
        if (isQuoted[tokenA][tokenB]) {
            return pairPrices[tokenA][tokenB];
        } else {
            return pairPrices[tokenB][tokenA];
        }
    }

    /// @dev Calculates price slippage in basis points
    /// @param oldPrice Old price of pair of tokens
    /// @param newPrice New price of pair of tokens
    /// @return Price slippage in basis points
    function calcSlippage(
        uint256 oldPrice,
        uint256 newPrice
    ) private pure returns (uint256) {
        uint256 minPrice = newPrice > oldPrice ? oldPrice : newPrice;
        uint256 maxPrice = newPrice > oldPrice ? newPrice : oldPrice;
        uint256 priceDif = maxPrice - minPrice;
        uint256 slippage = (priceDif * HUNDRED_PERCENT) / maxPrice;
        return slippage;
    }

    /// @dev Calculates the hash of the transaction with nonce and contract address
    /// @param nonce The unique integer
    function getTxHash(uint256 nonce) public view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    // Include the address of the contract to make hash even more unique
                    address(this),
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

    // TODO rename in to createOrder late
    function _createOrderMinimal(
        OrderArgs memory args
    ) private onlyBackend(args.nonce, args.signature) {

        // NOTICE: first order gets the ID of 1
        _orderId.increment();
        uint256 id = _orderId.current();

        _orders[id] = Order(
            id,
            msg.sender,
            args.tokenA,
            args.tokenB,
            args.amount,
            0,
            args.type_,
            args.side,
            args.limitPrice,
            args.slippage,
            args.isCancellable,
            OrderStatus.Active,
            args.feeAmount
        );

        // Mark that new ID corresponds to the pair of tokens
        tokensToOrders[args.tokenA][args.tokenB].push(id);

        // NOTICE: Order with ID1 has index 0
        _usersToOrders[msg.sender].push(id);

        emit OrderCreated(
            id,
            msg.sender,
            args.tokenA,
            args.tokenB,
            args.amount,
            args.type_,
            args.side,
            args.limitPrice,
            args.isCancellable
        );

        // In any case, `tokenB` is the one that is locked.
        // It gets transferred to the contract
        // Fee is also paid in `tokenB`
        // Fee gets transferred to the contract
        // TODO transfer it strate to admins wallet instead???
        IERC20(args.tokenB).safeTransferFrom(
            msg.sender,
            address(this),
            args.lockAmount + args.feeAmount
        );

    }

    function _createOrder(
        address tokenA,
        address tokenB,
        uint256 amount,
        OrderType type_,
        OrderSide side,
        uint256 limitPrice,
        uint256 slippage,
        bool isCancellable,
        uint256 nonce,
        bytes calldata signature
    ) private onlyBackend(nonce, signature) {
        // Make copies of parameters to avoid `Stack too deep` error
        address tokenA_ = tokenA;
        address tokenB_ = tokenB;
        uint256 amount_ = amount;
        OrderType _type = type_;
        OrderSide side_ = side;
        uint256 limitPrice_ = limitPrice;
        uint256 slippage_ = slippage;
        bool isCancellable_ = isCancellable;

        require(tokenA_ != address(0), "OC: Cannot buy native tokens!");
        require(amount_ != 0, "OC: Cannot buy/sell zero tokens!");
        if (isCancellable) {
            require(
                _type == OrderType.Limit,
                "OC: Only limits can be non-cancellable!"
            );
        }
        // If none of the tokens is quoted, `tokenB` becomes a quoted token
        if (!isQuoted[tokenA_][tokenB_] && !isQuoted[tokenB_][tokenA_]) {
            isQuoted[tokenA_][tokenB_] = true;
        }

        // The price of the pair in quoted tokens
        uint256 price = getPrice(tokenA_, tokenB_);

        uint256 lockAmount;
        if (_type == OrderType.Market) {
            require(limitPrice_ == 0, "OC: Limit not zero in market order!");
            require(
                isCancellable_ == false,
                "OC: Market orders are non-cancellable!"
            );
            if (side_ == OrderSide.Buy) {
                // User has to lock enough `tokenB` to pay according to current price
                if (isQuoted[tokenA_][tokenB_]) {
                    // If `tokenB` is a quoted token, then `price` does not change
                    // because it's expressed in this token
                    lockAmount = (amount_ * price) / PRICE_PRECISION;
                } else {
                    // If `tokenA` is a quoted token, then `price` should be inversed
                    lockAmount = (amount_ * PRICE_PRECISION) / price;
                }
            }
            if (side_ == OrderSide.Sell) {
                // User has to lock exactly the amount of `tokenB` he is selling
                lockAmount = amount_;
            }
        }
        if (_type == OrderType.Limit) {
            require(limitPrice_ != 0, "OC: Limit zero in limit order!");
            require(slippage_ == 0, "OC: Slippage not zero in limit order!");
            if (side_ == OrderSide.Buy) {
                // User has to lock enough `tokenB` to pay after price reaches the limit
                if (isQuoted[tokenA_][tokenB_]) {
                    // If `tokenB` is a quoted token, then `limitPrice` does not change
                    // because it's expressed in this token
                    lockAmount = (amount_ * limitPrice_) / PRICE_PRECISION;
                } else {
                    // If `tokenA` is a quoted token, then `limitPrice` should be inversed
                    lockAmount = (amount_ * PRICE_PRECISION) / limitPrice_;
                }
            }
            if (side_ == OrderSide.Sell) {
                // User has to lock exactly the amount of `tokenB` he is selling
                lockAmount = amount_;
            }
        }

        // Calculate the fee amount for the order
        uint256 feeAmount = _getFee(lockAmount);

        // Mark that fee amount of `tokenB` was increased
        tokenFees[tokenB_] += feeAmount;
        lockedTokens.add(tokenB_);

        // NOTICE: first order gets the ID of 1
        _orderId.increment();
        uint256 id = _orderId.current();

        _orders[id] = Order(
            id,
            msg.sender,
            tokenA_,
            tokenB_,
            amount_,
            0,
            _type,
            side_,
            limitPrice_,
            slippage_,
            isCancellable_,
            OrderStatus.Active,
            feeAmount
        );

        // Mark that new ID corresponds to the pair of tokens
        tokensToOrders[tokenA_][tokenB_].push(id);

        // NOTICE: Order with ID1 has index 0
        _usersToOrders[msg.sender].push(id);

        emit OrderCreated(
            id,
            msg.sender,
            tokenA_,
            tokenB_,
            amount_,
            _type,
            side_,
            limitPrice_,
            isCancellable_
        );

        // In any case, `tokenB` is the one that is locked.
        // It gets transferred to the contract
        // Fee is also paid in `tokenB`
        // Fee gets transferred to the contract
        // TODO transfer it strate to admins wallet instead???
        IERC20(tokenB_).safeTransferFrom(
            msg.sender,
            address(this),
            lockAmount + feeAmount
        );
    }

    function _cancelOrder(
        uint256 id,
        uint256 nonce,
        bytes calldata signature
    ) private onlyBackend(nonce, signature) {
        Order storage order = _orders[id];
        require(order.isCancellable, "OC: Order is non-cancellable!");
        require(
            (order.status == OrderStatus.Active) ||
                (order.status == OrderStatus.PartiallyClosed),
            "OC: Invalid order status!"
        );
        require(msg.sender == order.user, "OC: Not the order creator!");
        // Only the status of the order gets changed
        // The order itself does not get deleted
        order.status = OrderStatus.Cancelled;
        // Only the amount of `tokenB` left in the order should be returned
        // In order was partially executed, then this amount is less then `amountBInitial`
        uint256 leftAmount = order.amount - order.amountCurrent;

        emit OrderCancelled(order.id);

        // Only `tokenB` gets locked when creating an order.
        // Thus, only `tokenB` should be returned to the user
        IERC20(order.tokenB).safeTransfer(order.user, leftAmount);
    }

    function _matchOrders(
        uint256 initId,
        uint256[] memory matchedIds,
        uint256 nonce,
        bytes calldata signature
    ) private onlyBackend(nonce, signature) {
        // NOTICE: No checks are done here. Fully trust the backend

        // The amount of gas spent for all operations below
        uint256 gasSpent = 0;
        // Only 2/3 of block gas limit could be spent.
        uint256 gasThreshold = (block.gaslimit * 2) / 3;
        uint256 lastGasLeft = gasleft();

        Order memory initOrder = _orders[initId];

        // Indicates that pair price is expressed in `initOrder.tokenB`
        // If `price` is expressed in `tokenB` of the `initOrder` then it should be used when transferring
        // But if it's expressed in `tokenA` of the `initOrder` then is should be inversed when transferring
        bool quotedInInitB;
        if (isQuoted[initOrder.tokenA][initOrder.tokenB]) {
            quotedInInitB = true;
        } else {
            quotedInInitB = false;
        }

        // Old price of the pair before orders execution
        // Expressed in pair's quoted tokens
        uint256 oldPrice;
        if (quotedInInitB) {
            oldPrice = pairPrices[initOrder.tokenA][initOrder.tokenB];
        } else {
            oldPrice = pairPrices[initOrder.tokenB][initOrder.tokenA];
        }

        for (uint256 i = 0; i < matchedIds.length; i++) {
            // Matched order is always a limit order
            Order memory matchedOrder = _orders[i];

            // Mark that both orders matched
            matchedOrders[initOrder.id][matchedOrder.id] = true;
            matchedOrders[matchedOrder.id][initOrder.id] = true;

            emit OrdersMatched(initOrder.id, matchedOrder.id);

            // Price of the limit order used to calculate transferred amounts later.
            // Market orders are executed using this price
            // Expressed in pair's quoted tokens
            uint256 price;
            // In case two limit orders match, the one with a smaller amount will be fully closed first
            // so its price should be used
            if (initOrder.type_ == OrderType.Limit) {
                if (
                    initOrder.amount - initOrder.amountCurrent <
                    matchedOrder.amount - matchedOrder.amountCurrent
                ) {
                    price = initOrder.limitPrice;
                } else {
                    price = matchedOrder.limitPrice;
                }
                // In case a limit and a market orders match, market order gets executed
                // with price of a limit order
            } else {
                price = matchedOrder.limitPrice;
            }

            if (initOrder.side == OrderSide.Buy) {
                // When trying to buy more than available in matched order, whole availabe amount of matched order
                // gets transferred (it's less)
                if (
                    initOrder.amount - initOrder.amountCurrent >
                    matchedOrder.amount - matchedOrder.amountCurrent
                ) {
                    IERC20(initOrder.tokenA).safeTransfer(
                        initOrder.user,
                        matchedOrder.amount - matchedOrder.amountCurrent
                    );
                    if (quotedInInitB) {
                        IERC20(initOrder.tokenB).safeTransfer(
                            matchedOrder.user,
                            ((matchedOrder.amount -
                                matchedOrder.amountCurrent) * price) /
                                PRICE_PRECISION
                        );
                    } else {
                        IERC20(initOrder.tokenB).safeTransfer(
                            matchedOrder.user,
                            ((matchedOrder.amount -
                                matchedOrder.amountCurrent) * PRICE_PRECISION) /
                                price
                        );
                    }
                    // Initial order bought amount gets increased by the amount of tokens bought
                    initOrder.amountCurrent += (matchedOrder.amount -
                        matchedOrder.amountCurrent);
                    // Whole amount of matched order was sold
                    matchedOrder.amountCurrent = matchedOrder.amount;
                    // When trying to buy less or equal to what is available in matched order, only bought amount
                    // gets transferred (it's less). Some amount stays locked in the matched order
                } else {
                    IERC20(initOrder.tokenA).safeTransfer(
                        initOrder.user,
                        initOrder.amount - initOrder.amountCurrent
                    );
                    if (quotedInInitB) {
                        IERC20(initOrder.tokenB).safeTransfer(
                            matchedOrder.user,
                            ((initOrder.amount - initOrder.amountCurrent) *
                                price) / PRICE_PRECISION
                        );
                    } else {
                        IERC20(initOrder.tokenB).safeTransfer(
                            matchedOrder.user,
                            ((initOrder.amount - initOrder.amountCurrent) *
                                PRICE_PRECISION) / price
                        );
                    }
                    // Matched order sold amount gets increased by the amount of tokens sold
                    matchedOrder.amountCurrent += (initOrder.amount -
                        initOrder.amountCurrent);
                    // Whole amount of initial order was bought
                    initOrder.amountCurrent = initOrder.amount;
                }
            }
            if (initOrder.side == OrderSide.Sell) {
                // When trying to sell more tokens than buyer can purchase, only transfer to him the amount
                // he can purchase
                if (
                    initOrder.amount - initOrder.amountCurrent >
                    matchedOrder.amount - matchedOrder.amountCurrent
                ) {
                    if (quotedInInitB) {
                        IERC20(initOrder.tokenA).safeTransfer(
                            initOrder.user,
                            ((matchedOrder.amount -
                                matchedOrder.amountCurrent) * PRICE_PRECISION) /
                                price
                        );
                    } else {
                        IERC20(initOrder.tokenA).safeTransfer(
                            initOrder.user,
                            ((matchedOrder.amount -
                                matchedOrder.amountCurrent) * price) /
                                PRICE_PRECISION
                        );
                    }
                    IERC20(initOrder.tokenB).safeTransfer(
                        matchedOrder.user,
                        (matchedOrder.amount - matchedOrder.amountCurrent)
                    );
                    // Initial order sold amount gets increased by the amount of tokens sold
                    initOrder.amountCurrent += (matchedOrder.amount -
                        matchedOrder.amountCurrent);
                    // Whole amount of matched order was bought
                    matchedOrder.amountCurrent = matchedOrder.amount;
                    // When trying to sell less tokens than buyer can purchase, whole available amount of sold
                    // tokens gets transferred to the buyer
                } else {
                    if (quotedInInitB) {
                        IERC20(initOrder.tokenA).safeTransfer(
                            initOrder.user,
                            ((initOrder.amount - initOrder.amountCurrent) *
                                PRICE_PRECISION) / price
                        );
                    } else {
                        IERC20(initOrder.tokenA).safeTransfer(
                            initOrder.user,
                            ((initOrder.amount - initOrder.amountCurrent) *
                                price) / PRICE_PRECISION
                        );
                    }
                    IERC20(initOrder.tokenB).safeTransfer(
                        matchedOrder.user,
                        initOrder.amount - initOrder.amountCurrent
                    );
                    // Matched order bought amount gets increased by the amount of tokens sold
                    matchedOrder.amountCurrent += (initOrder.amount -
                        initOrder.amountCurrent);
                    // Whole amount of initial was sold
                    initOrder.amountCurrent = initOrder.amount;
                }
            }

            // Pair price gets updated to the price of the last executed limit order
            if (quotedInInitB) {
                pairPrices[initOrder.tokenA][initOrder.tokenB] = price;
            } else {
                pairPrices[initOrder.tokenB][initOrder.tokenA] = price;
            }

            emit PriceChanged(initOrder.tokenA, initOrder.tokenB, price);

            // Revert if slippage is too big for any of the orders
            uint256 slippage = calcSlippage(oldPrice, price);
            if (initOrder.type_ == OrderType.Market) {
                uint256 allowedSlippage = initOrder.slippage;
                if (slippage > allowedSlippage) {
                    revert SlippageTooBig(slippage);
                }
            }
            if (matchedOrder.type_ == OrderType.Market) {
                uint256 allowedSlippage = matchedOrder.slippage;
                if (slippage > allowedSlippage) {
                    revert SlippageTooBig(slippage);
                }
            }

            // Calculate the amount of gas spent for one iteration
            uint256 gasSpentPerIteration = lastGasLeft - gasleft();
            lastGasLeft = gasleft();
            // Increase the total amount of gas spent
            gasSpent += gasSpentPerIteration;
            // Check that no more than 2/3 of block gas limit was spent
            if (gasSpent >= gasThreshold) {
                emit GasLimitReached(gasSpent, block.gaslimit);
                break;
            }
        }

        // If the initial order is a limit order and it has a price higher than market,
        // then the whole amount left should be returned to the creator of the order
        if (
            (initOrder.type_ == OrderType.Limit) &&
            (initOrder.side == OrderSide.Buy) &&
            (initOrder.amountCurrent != initOrder.amount) &&
            // Limit price is expressed in the same tokens as oldPrice
            (initOrder.limitPrice > oldPrice)
        ) {
            IERC20(initOrder.tokenA).safeTransfer(
                initOrder.user,
                initOrder.amount - initOrder.amountCurrent
            );
        }
    }
}
