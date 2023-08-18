// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

interface IBentureDexErrors {
    error TxAlreadyExecuted(bytes32 txHash);
    error SlippageTooBig(uint256 slippage);
    error InvalidSignature();
    error OrderDoesNotExist();
    error InvalidSecondTokenAddress();
    error NoQuotedTokens();
    error AdminTokenNotSet();
    error ZeroPrice();
    error ZeroLockAmount();
    error NoFeesToWithdraw();
    error NotAdmin();
    error DifferentLength();
    error NonCancellable();
    error InvalidOrderStatus();
    error ZeroAmount();
    error ZeroAddress();
    error NotOrderCreator();
    error TransferFailed();
    error NotEnoughNativeTokens();
    error InvalidPrice();
    error PairNotCreated();
    error InvalidDecimals();
}
