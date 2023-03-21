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

    /// @notice Percentage of each order being paid as fee (in basis points)
    uint256 public feeRate;
    /// @notice The address of the backend account
    address public backendAcc;
    /// @dev Incrementing IDs of orders
    Counters.Counter internal _orderId;
    /// @dev Order's index is (order's ID - 1)
    mapping(uint256 => Order) internal _orders;
    /// @dev Mapping from user address to the array of orders IDs he created
    // TODO add getters for that
    mapping(address => uint256[]) internal _usersToOrders;
    // TODO fill it
    /// @dev Mapping from first token of the pair to the second
    ///      token of the pair to the price (how many second tokens
    ///      to pay for a single first token)
    ///      .e.g (USDT => DOGE => 420)
    mapping(address => mapping(address => uint256)) pairPrices;
    /// @notice Mapping from locked token addresses to the amount of
    ///         fees collected with them
    mapping(address => uint256) tokenFees;
    /// @notice List of tokens that are currently locked as fees
    ///         for orders creations
    EnumerableSet.AddressSet lockedTokens;

    /// @dev 100% in basis points (1 bp = 1 / 100 of 1%)
    uint256 private constant HUNDRED_PERCENT = 10000;

    modifier onlyBackend(
        bytes32 msgHash,
        bytes calldata signature,
        address user
    ) {
        require(
            _verifyBackendSignature(msgHash, signature, user),
            "OC: Only backend can call this function!"
        );
        _;
    }

    /// @notice Sets the inital fee rate for orders
    constructor() {
        // Default fee rate is 0.1% (1 BP)
        feeRate = 1;
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
        bytes32 msgHash,
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
            msgHash,
            signature
        );
    }

    /// @notice See {IOrderController-cancelOrder}
    function cancelOrder(
        uint256 id,
        bytes32 msgHash,
        bytes calldata signature
    ) external nonReentrant {
        _cancelOrder(id, msgHash, signature);
    }

    /// @notice See {IOrderController-setFee}
    function setFee(uint256 newFeeRate) external onlyOwner {
        require(newFeeRate != feeRate, "OC: Fee rates must differ!");
        emit FeeRateChanged(feeRate, newFeeRate);
        feeRate = newFeeRate;
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
        bytes32 msgHash,
        bytes calldata signature
    ) public nonReentrant onlyBackend(msgHash, signature, backendAcc) {
        // Only admin of the sold token (`tokenB`) project can start the ICO of tokens
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
            // TODO not sure
            // Price slippage for limit orders is always zero
            0,
            // Sale orders are non-cancellable
            false,
            msgHash,
            signature
        );
    }

    /// @notice See {IOrderController-startSaleMultiple}
    function startSaleMultiple(
        address tokenA,
        address tokenB,
        uint256[] memory amounts,
        uint256[] memory prices,
        bytes32 msgHash,
        bytes calldata signature
    ) public nonReentrant onlyBackend(msgHash, signature, backendAcc) {
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
                msgHash,
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
    // TODO split it in 2 functions?
    function matchOrders(
        uint256 initId,
        uint256[] memory matchedIds,
        bytes32 msgHash,
        bytes calldata signature
    ) public nonReentrant onlyBackend(msgHash, signature, backendAcc) {
        // The amount of gas spent for all operations below
        uint256 gasSpent = 0;
        // Only 2/3 of block gas limit could be spent.
        uint256 gasThreshold = (block.gaslimit * 2) / 3;
        uint256 lastGasLeft = gasleft();

        // NOTICE: No checks are done here. Fully trust the backend
        Order memory initOrder = _orders[initId];
        uint256 price = pairPrices[initOrder.tokenA][initOrder.tokenB];
        for (uint256 i = 0; i < matchedIds.length; i++) {
            Order memory matchedOrder = _orders[i];
            // TODO Is price multiplication/division even necessary here?
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
                    IERC20(initOrder.tokenB).safeTransfer(
                        matchedOrder.user,
                        (matchedOrder.amount - matchedOrder.amountCurrent) *
                            price
                    );
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
                    IERC20(initOrder.tokenB).safeTransfer(
                        matchedOrder.user,
                        (initOrder.amount - initOrder.amountCurrent) * price
                    );
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
                    IERC20(initOrder.tokenA).safeTransfer(
                        initOrder.user,
                        (matchedOrder.amount - matchedOrder.amountCurrent) /
                            price
                    );
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
                    IERC20(initOrder.tokenA).safeTransfer(
                        initOrder.user,
                        (initOrder.amount - initOrder.amountCurrent) / price
                    );
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
            // TODO change price here
            // ...

            // Revert if slippage is too big in any of the orders
            uint256 newPrice = pairPrices[initOrder.tokenA][initOrder.tokenB];
            // Real slippage
            uint256 slippage = calcSlippage(price, newPrice);
            // Slippage allowed in the market order
            uint256 allowedSlippage = matchedOrder.slippage;
            if (slippage > allowedSlippage) {
                revert SlippageTooBig(slippage);
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

            // TODO move it higher?
            emit OrdersMatched(initOrder.id, matchedOrder.id);
        }

        // If the initial order is a limit order and it has a price higher than market,
        // then the whole amount left should be returned to the creator of the order
        if (
            (initOrder.type_ == OrderType.Limit) &&
            (initOrder.limitPrice > price) &&
            (initOrder.amountCurrent != initOrder.amount)
        ) {
            IERC20(initOrder.tokenA).safeTransfer(
                initOrder.user,
                initOrder.amount - initOrder.amountCurrent
            );
        }
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
        // TODO is this a correct formula???
        retAmount = (amount * feeRate) / HUNDRED_PERCENT;
    }

    /// @dev Subtracts the fee from transferred tokens amount
    /// @param amount The amount of transferred tokens
    /// @return retAmount The transferred amount minus the fee
    function _subFee(uint256 amount) private view returns (uint256 retAmount) {
        retAmount = amount - _getFee(amount);
    }

    /// @dev Returns the price of one token of the pair in another token of the pair
    /// @param tokenA The address of the token that is received
    /// @param tokenB The address of the token that is sold
    /// @return The price of `tokenA` in `tokenB`
    function getPrice(
        address tokenA,
        address tokenB
    ) private view returns (uint256) {
        return pairPrices[tokenA][tokenB];
    }

    // TODO do I need it?
    /// @dev Finds the minimum of two values
    /// @param a The first value
    /// @param b The second value
    /// @return The minimum of two values
    /// @dev Used to define transfer amount in order match function
    function min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
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
        uint256 slippage = (priceDif * 10000) / maxPrice;
        return slippage;
    }

    /// @dev Verifies that message was signed by the backend
    /// @param msgHash An unsigned hashed data
    /// @param signature A signature used to sign the `msgHash`
    function _verifyBackendSignature(
        bytes32 msgHash,
        bytes calldata signature,
        address user
    ) private pure returns (bool) {
        // Remove the "\x19Ethereum Signed Message:\n" prefix from the signature
        bytes32 clearHash = msgHash.toEthSignedMessageHash();
        // Recover the address of the user who signed the `msgHash` with `signature`
        address recoveredUser = clearHash.recover(signature);
        return recoveredUser == user;
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
        bytes32 msgHash,
        bytes calldata signature
    ) private onlyBackend(msgHash, signature, backendAcc) {
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
        // The price of the pair
        // (how many `tokenB` to pay for a single `tokenA`)
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
                lockAmount = amount_ * price;
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
                require(
                    isCancellable_ == false,
                    "OC: Limit buy orders are non-cancellable!"
                );
                // User has to lock enough `tokenB` to pay after price reaches the limit
                lockAmount = amount_ * limitPrice_;
            }
            if (side_ == OrderSide.Sell) {
                require(
                    IBentureProducedToken(tokenB_).checkAdmin(msg.sender),
                    "OC: Not an admin of the project!"
                );
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

        {
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
        }

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
        bytes32 msgHash,
        bytes calldata signature
    ) private onlyBackend(msgHash, signature, backendAcc) {
        Order storage order = _orders[id];
        require(order.isCancellable, "OC: Order is non-cancellable!");
        // Only limit orders can be cancelled
        require(order.type_ == OrderType.Limit, "OC: Not a limit order!");
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

        // TODO why this formula was used?
        /* uint256 transferAmount = (order.amountBInitial * order.amountLeftToFill) / order.amountAInitial; */
        // Only `tokenB` gets locked when creating an order.
        // Thus, only `tokenB` should be returned to the user
        IERC20(order.tokenB).safeTransfer(order.user, leftAmount);
    }
}
