const { arrayify } = require("ethers/lib/utils");
const { ethers } = require("hardhat");
require("dotenv").config();
const { parseUnits, parseEther } = ethers.utils;
const backendAcc = new ethers.Wallet(process.env.BACKEND_PRIVATE_KEY);
const encodePacked = ethers.utils.solidityPack;
const keccak256 = ethers.utils.solidityKeccak256;
const arraify = ethers.utils.arrayify;
const { BigNumber } = require("ethers");

// Here are some helper functions to be used in tests

// By default PRICE_PRECISION in contract is 1e18
const PRICE_PRECISION = parseEther("1");

// By default fee rate in contract is 0.1% (10 BP)
const FEE_RATE = 10;

// Representation of 100% in Basis Points
const HUNDRED_PERCENT = BigNumber.from("10000");

// Encodes orders match function parameters to get the hash of the tx
// The same hashing algorithm is used on-chain for `matchOrders` function
// This hash should be signed by the backend. The signature is checked on-chain as well
// address: The address of the DEX contract to call
// initId: The ID of the first matched order
// matchedIds: The list of IDs of all other matched orders
// nonce: A unique integer for each call
function getTxHashMatch(address, initId, matchedIds, nonce) {
    return keccak256(
        ["bytes"],
        [
            encodePacked(
                ["address", "uint256", "uint256[]", "uint256"],
                [address, initId, matchedIds, nonce]
            ),
        ]
    );
}

// Encodes market order creation function parameters to get the hash of the tx
// The same hashing algorithm is used on-chain for `buyMarket` and `sellMarket` functions
// This hash should be signed by the backend. The signature is checked on-chain as well
// address: The address of the DEX contract to call
// tokenA: The address of the purchased token
// tokenB: The address of the sold token
// amount: The amound of purchased / sold tokens
// slippage: The maximum allowed price slippage
// nonce: A unique integer for each call
function getTxHashMarket(address, tokenA, tokenB, amount, slippage, nonce) {
    return keccak256(
        ["bytes"],
        [
            encodePacked(
                [
                    "address",
                    "address",
                    "address",
                    "uint256",
                    "uint256",
                    "uint256",
                ],
                [address, tokenA, tokenB, amount, slippage, nonce]
            ),
        ]
    );
}

// Used for orders matching
// Forms a hash of all parameters and signs it with the backend private key
// The resulting signature should be passed to `matchOrders` function as the last parameter
// address: The address of the DEX contract to call
// initId: The ID of the first matched order
// matchedIds: The list of IDs of all other matched orders
// nonce: A unique integer for each call
async function hashAndSignMatch(address, initId, matchedIds, nonce) {
    // Signature is prefixed with "\x19Ethereum Signed Message:\n"
    let signature = await backendAcc.signMessage(
        // Bytes hash should be converted to array before signing
        arrayify(getTxHashMatch(address, initId, matchedIds, nonce))
    );

    return signature;
}

// Used for market orders creation
// Forms a hash of all parameters and signs it with the backend private key
// The resulting signature should be passed to `matchOrders` function as the last parameter
// address: The address of the DEX contract to call
// tokenA: The address of the purchased token
// tokenB: The address of the sold token
// amount: The amound of purchased / sold tokens
// slippage: The maximum allowed price slippage
// nonce: A unique integer for each call
async function hashAndSignMarket(
    address,
    tokenA,
    tokenB,
    amount,
    slippage,
    nonce
) {
    // Signature is prefixed with "\x19Ethereum Signed Message:\n"
    let signature = await backendAcc.signMessage(
        // Bytes hash should be converted to array before signing
        arrayify(
            getTxHashMarket(address, tokenA, tokenB, amount, slippage, nonce)
        )
    );

    return signature;
}

// Calculates lock amount for *BUY* orders
// For sell orders it's always just their `order.amount`
// amount: The amount of tokens sold / bought
// price: The *order* price in quoted tokens
// quotedInOrderTokenB: True if `tokenB` of the *buy order* is a quoted token of the pair
function calcBuyerLockAmount(amount, limitPrice, quotedInOrderTokenB) {
    console.log("\nIn JS in get lock amount: ");
    console.log("Amount: ", amount.toString());
    console.log("*Limit* price: ", limitPrice.toString());
    if (quotedInOrderTokenB) {
        console.log(
            "Amount to lock: ",
            amount.mul(limitPrice).div(PRICE_PRECISION).toString()
        );
        return amount.mul(limitPrice).div(PRICE_PRECISION);
    } else {
        console.log(
            "Amount to lock: ",
            amount.mul(PRICE_PRECISION).div(limitPrice).toString()
        );
        return amount.mul(PRICE_PRECISION).div(limitPrice);
    }
}

// Calculates amount of spent tokens for BUYER
// Amount spent by buyer is `amountToMatched` from that branch
// initOrderAmount: The amount of init order
// matchedOrderAmount: The amount of matched order
// marketPrice: The price in quoted tokens
// quotedInInitB: True if `tokenB` of the *init order* (not always buy) is a quoted token of the pair
// buyMoreThanSell: True if buy order amount is greater than sell order amount
// initOrderIsBuy: True if buy order is initial order
function calcBuyerSpentAmount(
    initOrderAmount,
    matchedOrderAmount,
    marketPrice,
    quotedInInitB,
    buyMoreThanSell,
    initOrderIsBuy
) {
    console.log("\nIn JS in get buyer spent amount: ");
    console.log("Init order amount: ", initOrderAmount.toString());
    console.log("Matched order amount: ", matchedOrderAmount.toString());
    console.log("Market price: ", marketPrice.toString());
    let buyerAmountSpent;
    // First branch of `getAmounts`
    if (initOrderIsBuy) {
        console.log("Init order is buy");
        if (buyMoreThanSell) {
            console.log("Buy more than sell");
            let amountToInit = matchedOrderAmount;
            if (quotedInInitB) {
                buyerAmountSpent = amountToInit
                    .mul(marketPrice)
                    .div(PRICE_PRECISION)
                    .toString();
            } else {
                buyerAmountSpent = amountToInit
                    .mul(PRICE_PRECISION)
                    .div(marketPrice);
            }
        } else {
            console.log("Sell more than buy or equal");
            let amountToInit = initOrderAmount;
            if (quotedInInitB) {
                buyerAmountSpent = amountToInit
                    .mul(marketPrice)
                    .div(PRICE_PRECISION)
                    .toString();
            } else {
                buyerAmountSpent = amountToInit
                    .mul(PRICE_PRECISION)
                    .div(marketPrice);
            }
        }
        // Second branch of `getAmounts`
    } else {
        console.log("Init order is sell");
        if (!buyMoreThanSell) {
            console.log("Sell more than buy or equal");
            let amountToMatched = matchedOrderAmount;
            if (quotedInInitB) {
                buyerAmountSpent = amountToMatched
                    .mul(PRICE_PRECISION)
                    .div(marketPrice);
            } else {
                buyerAmountSpent = amountToMatched
                    .mul(marketPrice)
                    .div(PRICE_PRECISION);
            }
        } else {
            console.log("Buy more than sell");
            let amountToMatched = initOrderAmount;
            if (quotedInInitB) {
                buyerAmountSpent = amountToMatched
                    .mul(PRICE_PRECISION)
                    .div(marketPrice);
            } else {
                buyerAmountSpent = amountToMatched
                    .mul(marketPrice)
                    .div(PRICE_PRECISION);
            }
        }
    }
    console.log("Amount to spend: ", buyerAmountSpent.toString());
    return buyerAmountSpent;
}
// Calculates amount of spent tokens for SELLER
// Amount spent by seller is `amountToMatched` from that branch
// initOrderAmount: The amount of init order
// matchedOrderAmount: The amount of matched order
// marketPrice: The price in quoted tokens
// quotedInInitB: True if `tokenB` of the *init order* (not always sell) is a quoted token of the pair
// sellMoreThanBuy: True if sell order amount is greater than buy order amount
// initOrderIsSell: True if sell order is initial order
function calcSellerSpentAmount(
    initOrderAmount,
    matchedOrderAmount,
    marketPrice,
    quotedInInitB,
    sellMoreThanBuy,
    initOrderIsSell
) {
    console.log("\nIn JS in get seller spent amount: ");
    console.log("Init order amount: ", initOrderAmount.toString());
    console.log("Matched order amount: ", matchedOrderAmount.toString());
    console.log("Market price: ", marketPrice.toString());
    let sellerAmountSpent;
    // First branch of `getAmounts`
    if (!initOrderIsSell) {
        console.log("Init order is buy");
        if (!sellMoreThanBuy) {
            console.log("Buy more than sell or equal");
            sellerAmountSpent = matchedOrderAmount;
        } else {
            console.log("Sell more than buy");
            sellerAmountSpent = initOrderAmount;
        }
        // Second branch of `getAmounts`
    } else {
        console.log("Init order is sell");
        if (sellMoreThanBuy) {
            console.log("Sell more than buy");
            sellerAmountSpent = matchedOrderAmount;
        } else {
            console.log("Buy more than sell or equal");
            sellerAmountSpent = initOrderAmount;
        }
    }
    console.log("Amount to spend: ", sellerAmountSpent.toString());
    return sellerAmountSpent;
}

// Calculates fee amount
// lockAmount: The amount of tokens sold / bought
function calcFeeAmount(lockAmount) {
    return lockAmount.mul(FEE_RATE).div(HUNDRED_PERCENT);
}

module.exports = {
    getTxHashMatch,
    getTxHashMarket,
    hashAndSignMatch,
    hashAndSignMarket,
    calcBuyerLockAmount,
    calcBuyerSpentAmount,
    calcSellerSpentAmount,
    calcFeeAmount,
};
