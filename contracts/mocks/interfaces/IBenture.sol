// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "./errors/IBentureErrors.sol";

/// @title Dividend-Paying Token Interface

/// @dev An interface for dividends distributing contract
interface IBenture is IBentureErrors {
    /// @notice Creates a new pool
    /// @param token The token that will be locked in the pool
    function createPool(address token) external;

    /// @notice Locks the provided amount of user's tokens in the pool
    /// @param origToken The address of the token to lock
    /// @param amount The amount of tokens to lock
    function lockTokens(address origToken, uint256 amount) external;

    /// @notice Locks all user's tokens in the pool
    /// @param origToken The address of the token to lock
    function lockAllTokens(address origToken) external;

    /// @notice Unlocks the provided amount of user's tokens from the pool
    /// @param origToken The address of the token to unlock
    /// @param amount The amount of tokens to unlock
    function unlockTokens(address origToken, uint256 amount) external;

    /// @notice Unlocks all locked tokens of the user in the pool
    /// @param origToken The address of the token to unlock
    function unlockAllTokens(address origToken) external;

    /// @notice Allows admin to distribute dividends among lockers
    /// @param origToken The tokens to the holders of which the dividends will be paid
    /// @param distToken The token that will be paid
    ///        Use zero address for native tokens
    /// @param amount The amount of ERC20 tokens that will be paid
    /// @param isEqual Indicates whether distribution will be equal
    function distributeDividends(
        address origToken,
        address distToken,
        uint256 amount,
        bool isEqual
    ) external payable;

    /// @notice Allows user to claim dividends from a single distribution
    /// @param id The ID of the distribution to claim
    function claimDividends(uint256 id) external;

    /// @notice Allows user to claim dividends from multiple distributions
    ///         WARNING: Potentially can exceed block gas limit!
    /// @param ids The array of IDs of distributions to claim
    function claimMultipleDividends(uint256[] calldata ids) external;

    /// @notice Allows admin to distribute provided amounts of tokens to the provided list of users
    /// @param token The address of the token to be distributed
    /// @param users The list of addresses of users to receive tokens
    /// @param amounts The list of amounts each user has to receive
    function distributeDividendsCustom(
        address token,
        address[] calldata users,
        uint256[] calldata amounts
    ) external payable;

    /// @notice Sets the token factory contract address
    /// @param factoryAddress The address of the factory
    /// @dev NOTICE: This address can't be set the constructor because
    ///      `Benture` is deployed *before* factory contract.
    function setFactoryAddress(address factoryAddress) external;

    /// @notice Returns info about the pool of a given token
    /// @param token The address of the token of the pool
    /// @return The address of the tokens in the pool.
    /// @return The number of users who locked their tokens in the pool
    /// @return The amount of locked tokens
    function getPool(
        address token
    ) external view returns (address, uint256, uint256);

    /// @notice Returns the array of lockers of the pool
    /// @param token The address of the token of the pool
    /// @return The array of lockers of the pool
    function getLockers(address token) external view returns (address[] memory);

    /// @notice Checks if user is a locker of the provided token pool
    /// @param token The address of the token of the pool
    /// @param user The address of the user to check
    /// @return True if user is a locker in the pool. Otherwise - false.
    function isLocker(address token, address user) external view returns (bool);

    /// @notice Returns the current lock amount of the user
    /// @param user The address of the user to check
    /// @param token The address of the token of the pool
    /// @return The current lock amount
    function getCurrentLock(
        address user,
        address token
    ) external view returns (uint256);

    /// @notice Returns the list of IDs of all active distributions the admin has started
    /// @param admin The address of the admin
    /// @return The list of IDs of all active distributions the admin has started
    function getDistributions(
        address admin
    ) external view returns (uint256[] memory);

    /// @notice Returns the distribution with the given ID
    /// @param id The ID of the distribution to search for
    /// @return All information about the distribution
    function getDistribution(
        uint256 id
    ) external view returns (uint256, address, address, uint256, bool);

    /// @notice Checks if user has claimed dividends of the provided distribution
    /// @param id The ID of the distribution to check
    /// @param user The address of the user to check
    /// @return True if user has claimed dividends. Otherwise - false
    function hasClaimed(uint256 id, address user) external view returns (bool);

    /// @notice Checks if the distribution with the given ID was started by the given admin
    /// @param id The ID of the distribution to check
    /// @param admin The address of the admin to check
    /// @return True if admin has started the distribution with the given ID. Otherwise - false.
    function checkStartedByAdmin(
        uint256 id,
        address admin
    ) external view returns (bool);

    /// @notice Returns the share of the user in a given distribution
    /// @param id The ID of the distribution to calculate share in
    /// @return The share of the caller
    function getMyShare(uint256 id) external view returns (uint256);

    /// @dev Indicates that a new pool has been created
    event PoolCreated(address indexed token);

    /// @dev Indicates that a pool has been deleted
    event PoolDeleted(address indexed token);

    /// @dev Indicated that tokens have been locked
    event TokensLocked(
        address indexed user,
        address indexed token,
        uint256 amount
    );

    /// @dev Indicated that tokens have been locked
    event TokensUnlocked(
        address indexed user,
        address indexed token,
        uint256 amount
    );

    /// @dev Indicates that new dividends distribution was started
    /// @param origToken The tokens to the holders of which the dividends will be paid
    /// @param distToken The token that will be paid
    /// @param amount The amount of tokens that will be paid
    /// @param isEqual Indicates whether distribution will be equal
    event DividendsStarted(
        address indexed origToken,
        address indexed distToken,
        uint256 indexed amount,
        bool isEqual
    );

    /// @dev Indicates that dividends were claimed by a user
    /// @param id The ID of the distribution that was claimed
    /// @param user The address of the user who claimed the distribution
    event DividendsClaimed(uint256 indexed id, address user);

    /// @dev Indicates that multiple dividends were claimed by a user
    /// @param user The address of the user who claimed the distributions
    /// @param count The total number of claimed dividends
    event MultipleDividendsClaimed(address user, uint256 count);

    /// @dev Indicates that custom dividends were sent to the list of users
    /// @param token The token distributed
    /// @param count The total number of users who received their shares
    ///              Counting starts from the first user and does not skip any users
    event CustomDividendsDistributed(address indexed token, uint256 count);

    /// @dev Indicates that 2/3 of block gas limit was spent during the
    ///      iteration inside the contract method
    /// @param gasLeft How much gas was used
    /// @param gasLimit The block gas limit
    event GasLimitReached(uint256 gasLeft, uint256 gasLimit);
}
