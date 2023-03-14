// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

interface IBentureErrors {
    error NativeTokenTransferFailed();
    error InvalidTokenAddress();
    error PoolAlreadyExists();
    error CallerNotAdminOrFactory();
    error InvalidLockAmount();
    error CallerIsNotLocker();
    error PoolDoesNotExist();
    error NoLockersInThePool();
    error EmptyList();
    error ListsLengthDiffers();
    error WrongTokenInsideThePool();
    error UserDoesNotHaveProjectTokens();
    error UserDoesNotHaveAnAdminToken();
    error InvalidUnlockAmount();
    error NoLockedTokens();
    error WithdrawTooBig();
    error InvalidDividendsAmount();
    error NotEnoughNativeTokens();
    error DistributionHasNotStartedYet();
    error InvalidDistribution();
    error UserDoesNotHaveLockedTokens();
    error AlreadyClaimed();
    error InvalidUserAddress();
    error InvalidAdminAddress();
    error InvalidDistributionId();
    error DistributionNotStarted();
    error FactoryAddressNotSet();
    error InvalidFactoryAddress();
}
