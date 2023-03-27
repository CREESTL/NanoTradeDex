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

    /// @dev Allows to execute only transactions signed by backend
    modifier onlyBackend(
        uint256 initId,
        uint256[] memory matchedIds,
        uint256 nonce,
        bytes memory signature
    ) {
        // Calculate tx hash. Include some function parameters and nonce to
        // avoid Replay Attacks
        bytes32 txHash = getTxHash(initId, matchedIds, nonce);
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
        require(user != address(0), "OC: Zero user address not allowed!");
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
        require(checkOrderExists(_id), "OC: Order does not exist!");
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

    /// @notice See {IOrderController-buyMarket}
    function buyMarket(
        address tokenA,
        address tokenB,
        uint256 amount,
        uint256 slippage
    ) public nonReentrant {
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
            false
        );

        require(args.tokenA != address(0), "OC: Cannot buy native tokens!");
        require(args.amount != 0, "OC: Cannot buy/sell zero tokens!");

        // If none of the tokens is quoted, `tokenB_` becomes a quoted token
        if (
            !isQuoted[args.tokenA][args.tokenB] &&
            !isQuoted[args.tokenB][args.tokenA]
        ) {
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

        _createOrder(args);
    }

    /// @notice See {IOrderController-sellMarket}
    function sellMarket(
        address tokenA,
        address tokenB,
        uint256 amount,
        uint256 slippage
    ) public nonReentrant {
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
            false
        );

        require(args.tokenA != address(0), "OC: Cannot buy native tokens!");
        require(args.amount != 0, "OC: Cannot buy/sell zero tokens!");

        // If none of the tokens is quoted, `tokenB_` becomes a quoted token
        if (
            !isQuoted[args.tokenA][args.tokenB] &&
            !isQuoted[args.tokenB][args.tokenA]
        ) {
            isQuoted[args.tokenA][args.tokenB] = true;
        }

        // User has to lock exactly the amount of `tokenB` he is selling
        uint256 lockAmount = amount;

        // Calculate the fee amount for the order
        uint256 feeAmount = _getFee(lockAmount);

        // Mark that fee amount of `tokenB` was increased
        tokenFees[args.tokenB] += feeAmount;
        lockedTokens.add(args.tokenB);

        // Set the real fee and lock amounts
        args.feeAmount = feeAmount;
        args.lockAmount = lockAmount;

        _createOrder(args);
    }

    /// @notice See {IOrderController-buyLimit}
    function buyLimit(
        address tokenA,
        address tokenB,
        uint256 amount,
        uint256 limitPrice,
        bool isCancellable
    ) public nonReentrant {
        // Form args structure to pass it to `_createOrder` function later
        OrderArgs memory args = OrderArgs(
            tokenA,
            tokenB,
            amount,
            // Initial amount is always 0
            0,
            OrderType.Limit,
            OrderSide.Buy,
            limitPrice,
            // Slippage is 0 for limit orders
            0,
            // Leave 0 for lockAmount and feeAmount for now
            0,
            0,
            isCancellable
        );

        require(args.tokenA != address(0), "OC: Cannot buy native tokens!");
        require(args.amount != 0, "OC: Cannot buy/sell zero tokens!");

        // If none of the tokens is quoted, `tokenB_` becomes a quoted token
        if (
            !isQuoted[args.tokenA][args.tokenB] &&
            !isQuoted[args.tokenB][args.tokenA]
        ) {
            isQuoted[args.tokenA][args.tokenB] = true;
        }

        uint256 lockAmount;

        // User has to lock enough `tokenB` to pay after price reaches the limit
        if (isQuoted[args.tokenA][args.tokenB]) {
            // If `tokenB` is a quoted token, then `limitPrice` does not change
            // because it's expressed in this token
            lockAmount = (args.amount * args.limitPrice) / PRICE_PRECISION;
        } else {
            // If `tokenA` is a quoted token, then `limitPrice` should be inversed
            lockAmount = (args.amount * PRICE_PRECISION) / args.limitPrice;
        }

        // Calculate the fee amount for the order
        uint256 feeAmount = _getFee(lockAmount);

        // Mark that fee amount of `tokenB` was increased
        tokenFees[args.tokenB] += feeAmount;
        lockedTokens.add(args.tokenB);

        // Set the real fee and lock amounts
        args.feeAmount = feeAmount;
        args.lockAmount = lockAmount;

        _createOrder(args);
    }

    /// @notice See {IOrderController-sellLimit}
    function sellLimit(
        address tokenA,
        address tokenB,
        uint256 amount,
        uint256 limitPrice,
        bool isCancellable
    ) public nonReentrant {
        // Form args structure to pass it to `createOrder` function later
        OrderArgs memory args = OrderArgs(
            tokenA,
            tokenB,
            amount,
            // Initial amount is always 0
            0,
            OrderType.Limit,
            OrderSide.Sell,
            limitPrice,
            // Slippage is 0 for limit orders
            0,
            // Leave 0 for lockAmount and feeAmount for now
            0,
            0,
            isCancellable
        );

        require(args.tokenA != address(0), "OC: Cannot buy native tokens!");
        require(args.amount != 0, "OC: Cannot buy/sell zero tokens!");

        // If none of the tokens is quoted, `tokenB_` becomes a quoted token
        if (
            !isQuoted[args.tokenA][args.tokenB] &&
            !isQuoted[args.tokenB][args.tokenA]
        ) {
            isQuoted[args.tokenA][args.tokenB] = true;
        }

        // User has to lock exactly the amount of `tokenB` he is selling
        uint256 lockAmount = args.amount;

        // Calculate the fee amount for the order
        uint256 feeAmount = _getFee(lockAmount);

        // Mark that fee amount of `tokenB` was increased
        tokenFees[args.tokenB] += feeAmount;
        lockedTokens.add(args.tokenB);

        // Set the real fee and lock amounts
        args.feeAmount = feeAmount;
        args.lockAmount = lockAmount;

        _createOrder(args);
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
        uint256 price
    ) public nonReentrant {
        // Only admin of the sold token `tokenB` project can start the ICO of tokens
        require(
            IBentureProducedToken(tokenB).checkAdmin(msg.sender),
            "OC: Not an admin of the project"
        );

        emit SaleStarted(tokenB);

        sellLimit(
            tokenA,
            tokenB,
            amount,
            price,
            // Sale orders are non-cancellable
            false
        );
    }

    /// @notice See {IOrderController-startSaleMultiple}
    function startSaleMultiple(
        address tokenA,
        address tokenB,
        uint256[] memory amounts,
        uint256[] memory prices
    ) public nonReentrant {
        require(amounts.length == prices.length, "OC: Arrays length differs!");

        // The amount of gas spent for all operations below
        uint256 gasSpent = 0;
        // Only 2/3 of block gas limit could be spent.
        uint256 gasThreshold = (block.gaslimit * 2) / 3;
        uint256 lastGasLeft = gasleft();

        for (uint256 i = 0; i < amounts.length; i++) {
            startSaleSingle(tokenA, tokenB, amounts[i], prices[i]);

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

    /// @dev Calculates the hash of the transaction with nonce and contract address
    /// @param initId The ID of first matched order
    /// @param matchedIds The list of IDs of other matched orders
    /// @param nonce The unique integer
    /// @dev NOTICE: Backend must form tx hash exactly the same way
    function getTxHash(
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

    function _createOrder(OrderArgs memory args) private {
        // NOTICE: first order gets the ID of 1
        _orderId.increment();
        uint256 id = _orderId.current();

        _orders[id] = Order(
            id,
            msg.sender,
            args.tokenA,
            args.tokenB,
            args.amount,
            args.amountFilled,
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

    function _cancelOrder(uint256 id) private {
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
        uint256 leftAmount = order.amount - order.amountFilled;

        emit OrderCancelled(order.id);

        // Only `tokenB` gets locked when creating an order.
        // Thus, only `tokenB` should be returned to the user
        IERC20(order.tokenB).safeTransfer(order.user, leftAmount);
    }

    // TODO add comments
    function _getNewPrice(
        Order memory initOrder,
        Order memory matchedOrder
    ) private view returns (uint256) {
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
            } else {
                price = matchedOrder.limitPrice;
            }
            // In case a limit and a market orders match, market order gets executed
            // with price of a limit order
        } else {
            price = matchedOrder.limitPrice;
        }

        return price;
    }


    function _checkAndChangeStatus(Order memory order) private {
        Order storage order_ = _orders[order.id];
        require(order_.status != OrderStatus.Cancelled, "OC: Cannot change status of cancelled order");
        require(order_.status != OrderStatus.Closed, "OC: Cannot change status of closed order");
        if (order_.amountFilled == order_.amount) {
            order_.status = OrderStatus.Closed;
        } else {
            order_.status = OrderStatus.PartiallyClosed;
        }
    }


    function _getAmounts(
        Order memory initOrder,
        Order memory matchedOrder,
        bool quotedInInitB,
        uint256 price
    ) private returns (address, address, uint256, uint256, address, address) {


        // The address of the token to transfer to the buyer
        address tokenToBuyer;
        // The address of the token to transfer to the seller
        address tokenToSeller;
        // The amount to be transferred to the buyer later
        uint256 buyerAmount;
        // The amount to be transferred to the seller later
        uint256 sellerAmount;
        // The address of the buyer
        address buyerAddress;
        // The address of the seller
        address sellerAddress;

        if (initOrder.side == OrderSide.Buy) {
            // Creator of the `initOrder` is buying and receiving `tokenA`
            buyerAddress = initOrder.user;
            sellerAddress = matchedOrder.user;
            tokenToBuyer = initOrder.tokenA;
            tokenToSeller = initOrder.tokenB;
            // When trying to buy more than available in matched order, whole availabe amount of matched order
            // gets transferred (it's less)
            if (
                initOrder.amount - initOrder.amountFilled >
                matchedOrder.amount - matchedOrder.amountFilled
            ) {
                buyerAmount = matchedOrder.amount - matchedOrder.amountFilled;
                if (quotedInInitB) {
                    sellerAmount =
                        (buyerAmount *
                            price) /
                        PRICE_PRECISION;
                } else {
                    sellerAmount =
                        (buyerAmount *
                            PRICE_PRECISION) /
                        price;
                }
                // TODO move it ot transfer funds
                // Initial order bought amount gets increased by the amount of tokens bought
                initOrder.amountFilled += buyerAmount;
                // Whole amount of matched order was sold
                matchedOrder.amountFilled = matchedOrder.amount;


                // When trying to buy less or equal to what is available in matched order, only bought amount
                // gets transferred (it's less). Some amount stays locked in the matched order
            } else {
                buyerAmount = initOrder.amount - initOrder.amountFilled;
                if (quotedInInitB) {
                    sellerAmount =
                        (buyerAmount * price) /
                        PRICE_PRECISION;
                } else {
                    (buyerAmount *
                        PRICE_PRECISION) / price;
                }
                // Matched order sold amount gets increased by the amount of tokens sold
                matchedOrder.amountFilled += buyerAmount;
                // Whole amount of initial order was bought
                initOrder.amountFilled = initOrder.amount;

            }
        }
        if (initOrder.side == OrderSide.Sell) {
            // Creator of the `initOrder` is selling and giving `tokenA`
            buyerAddress = matchedOrder.user;
            sellerAddress = initOrder.user;
            tokenToBuyer = initOrder.tokenA;
            tokenToSeller = initOrder.tokenB;
            // When trying to sell more tokens than buyer can purchase, only transfer to him the amount
            // he can purchase
            if (
                initOrder.amount - initOrder.amountFilled >
                matchedOrder.amount - matchedOrder.amountFilled
            ) {

                buyerAmount = matchedOrder.amount - matchedOrder.amountFilled;

                if (quotedInInitB) {
                    sellerAmount =
                        (buyerAmount *
                            PRICE_PRECISION) /
                        price;
                } else {
                    sellerAmount =
                        (buyerAmount *
                            price) /
                        PRICE_PRECISION;
                }


                // Initial order sold amount gets increased by the amount of tokens sold
                initOrder.amountFilled += buyerAmount;
                // Whole amount of matched order was bought
                matchedOrder.amountFilled = matchedOrder.amount;

                // When trying to sell less tokens than buyer can purchase, whole available amount of sold
                // tokens gets transferred to the buyer
            } else {

                buyerAmount = initOrder.amount - initOrder.amountFilled;

                if (quotedInInitB) {
                    sellerAmount =
                        (buyerAmount *
                            PRICE_PRECISION) /
                        price;
                } else {
                    sellerAmount =
                        (buyerAmount * price) /
                        PRICE_PRECISION;
                }


                // Matched order bought amount gets increased by the amount of tokens sold
                matchedOrder.amountFilled += buyerAmount;
                // Whole amount of initial was sold
                initOrder.amountFilled = initOrder.amount;

            }

            // Change order's status according to it's filled amount
            _checkAndChangeStatus(initOrder);
            _checkAndChangeStatus(matchedOrder);
        }

        return (
            tokenToBuyer,
            tokenToSeller,
            buyerAmount,
            sellerAmount,
            buyerAddress,
            sellerAddress
        );
    }

    function _transferFunds(
        address tokenToBuyer,
        address tokenToSeller,
        uint256 buyerAmount,
        uint256 sellerAmount,
        address buyerAddress,
        address sellerAddress
    ) private {
        IERC20(tokenToBuyer).safeTransfer(buyerAddress, buyerAmount);
        IERC20(tokenToSeller).safeTransfer(sellerAddress, sellerAmount);
    }

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

    function _matchOrders(
        uint256 initId,
        uint256[] memory matchedIds,
        uint256 nonce,
        bytes calldata signature
    ) private onlyBackend(initId, matchedIds, nonce, signature) {
        // NOTICE: No checks are done here. Fully trust the backend


        // The amount of gas spent for all operations below
        uint256 gasSpent = 0;
        // Only 2/3 of block gas limit could be spent.
        uint256 gasThreshold = (block.gaslimit * 2) / 3;
        uint256 lastGasLeft = gasleft();

        Order memory initOrder = _orders[initId];

        // TODO move it to getAmounts???
        // Indicates that pair price is expressed in `initOrder.tokenB`
        // If `price` is expressed in `tokenB` of the `initOrder` then it should be used when transferring
        // But if it's expressed in `tokenA` of the `initOrder` then is should be inversed when transferring
        bool quotedInInitB;
        if (isQuoted[initOrder.tokenA][initOrder.tokenB]) {
            quotedInInitB = true;
        } else {
            quotedInInitB = false;
        }

        // Check if initial order is a buy limit order with price higher than market
        bool returnChange;
        {
            uint256 marketPrice = getPrice(initOrder.tokenA, initOrder.tokenB);
            if (
                (initOrder.type_ == OrderType.Limit) &&
                    (initOrder.side == OrderSide.Buy) &&
                        (initOrder.limitPrice > marketPrice)
            ) {
                returnChange = true;
            }
        }

        for (uint256 i = 0; i < matchedIds.length; i++) {
            // Old price of the pair before orders execution
            // Expressed in pair's quoted tokens
            uint256 oldPrice = getPrice(initOrder.tokenA, initOrder.tokenB);

            Order storage matchedOrder = _orders[i];

            emit OrdersMatched(initOrder.id, matchedOrder.id);

            // Mark that both orders matched
            matchedOrders[initOrder.id][matchedOrder.id] = true;
            matchedOrders[matchedOrder.id][initOrder.id] = true;

            uint256 newPrice = _getNewPrice(initOrder, matchedOrder);
            {

                (
                    address tokenToBuyer,
                    address tokenToSeller,
                    uint256 buyerAmount,
                    uint256 sellerAmount,
                    address buyerAddress,
                    address sellerAddress
                ) = _getAmounts(initOrder, matchedOrder, quotedInInitB, newPrice);

                _transferFunds(
                    tokenToBuyer,
                    tokenToSeller,
                    buyerAmount,
                    sellerAmount,
                    buyerAddress,
                    sellerAddress
                );
            }
            // Pair price gets updated to the price of the last executed limit order
            if (quotedInInitB) {
                pairPrices[initOrder.tokenA][initOrder.tokenB] = newPrice;
            } else {
                pairPrices[initOrder.tokenB][initOrder.tokenA] = newPrice;
            }

            emit PriceChanged(initOrder.tokenA, initOrder.tokenB, newPrice);

            // Slippage is only allowed for market orders.
            // Only matched orders can be market
            if (matchedOrder.type_ == OrderType.Market) {
                _checkSlippage(oldPrice, newPrice, matchedOrder.slippage);
            }

            // Revert if slippage is too big for any of the orders

            // Calculate the amount of gas spent for one iteration
            uint256 gasSpentPerIteration = lastGasLeft - gasleft();
            lastGasLeft = gasleft();
            // Increase the total amount of gas spent
            gasSpent += gasSpentPerIteration;
            // Check that no more than 2/3 of block gas limit was spent
            if (gasSpent >= gasThreshold) {
                emit GasLimitReached(gasSpent, block.gaslimit);
                // No revert here. Part of changes will take place
                break;
            }
        }

        // If the initial order is a limit buy order and it had a price higher then a market
        // it means that he was matched with several limit sell orders with market price
        // So the "change" left from the lock amount of this order should be returned
        if (
            (returnChange) &&
            (initOrder.amountFilled != initOrder.amount)
        ) {
            IERC20(initOrder.tokenA).safeTransfer(
                initOrder.user,
                initOrder.amount - initOrder.amountFilled
            );
            // After that init order gets closed
            initOrder.status = OrderStatus.Closed;
        }
    }
}
