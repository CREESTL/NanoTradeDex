// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

interface IBentureProducedTokenErrors {
    error TheTokenIsNotMintable();
    error UserDoesNotHaveAnAdminToken();
    error EmptyTokenName();
    error EmptyTokenSymbol();
    error EmptyTokenDecimals();
    error InvalidAdminTokenAddress();
    error NotZeroMaxTotalSupply();
    error InvalidUserAddress();
    error SupplyExceedsMaximumSupply();
    error InvalidBurnAmount();
    error NoTokensToBurn();
    error DeletingHolderFailed();
    error SenderCanNotBeAReceiver();
    error NoTokensToTransfer();
}
