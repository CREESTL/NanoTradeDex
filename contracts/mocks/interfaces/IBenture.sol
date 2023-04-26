// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "./errors/IBentureErrors.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

/// @title Dividend-Paying Token Interface
interface IBenture is IBentureErrors {
    /// @dev Pool to lock tokens
    /// @dev `lockers` and `lockersArray` basically store the same list of addresses
    ///       but they are used for different purposes
    struct Pool {
        // The address of the token inside the pool
        address token;
        // The list of all lockers of the pool
        EnumerableSetUpgradeable.AddressSet lockers;
        // The amount of locked tokens
        uint256 totalLocked;
        // Mapping from user address to the amount of tokens currently locked by the user in the pool
        // Could be 0 if user has unlocked all his tokens
        mapping(address => uint256) lockedByUser;
        // Mapping from user address to distribution ID to locked tokens amount
        // Shows "to what amount was the user's locked changed before the distribution with the given ID"
        // If the value for ID10 is 0, that means that user's lock amount did not change before that distribution
        // If the value for ID10 is 500, that means that user's lock amount changed to 500 before that distibution.
        // Amounts locked for N-th distribution (used to calculate user's dividends) can only
        // be updated since the start of (N-1)-th distribution and till the start of the N-th
        // distribution. `distributionIds.current()` is the (N-1)-th distribution in our case.
        // So we have to increase it by one to get the ID of the upcoming distribution and
        // the amount locked for that distribution.
        // For example, if distribution ID476 has started and Bob adds 100 tokens to his 500 locked tokens
        // the pool, then his lock for the distribution ID477 should be 600.
        mapping(address => mapping(uint256 => uint256)) lockHistory;
        // Mapping from user address to a list of IDs of distributions *before which* user's lock amount was changed
        // For example an array of [1, 2] means that user's lock amount changed before 1st and 2nd distributions
        // `EnumerableSetUpgradeable` can't be used here because it does not *preserve* the order of IDs and we need that
        mapping(address => uint256[]) lockChangesIds;
        // Mapping indicating that before the distribution with the given ID, user's lock amount was changed
        // Basically, a `true` value for `[user][ID]` here means that this ID is *in* the `lockChangesIds[user]` array
        // So it's used to check if a given ID is in the array.
        mapping(address => mapping(uint256 => bool)) changedBeforeId;
    }

    /// @dev Stores information about a specific dividends distribution
    struct Distribution {
        // ID of distributiion
        uint256 id;
        // The token owned by holders
        address origToken;
        // The token distributed to holders
        address distToken;
        // The amount of `distTokens` or native tokens paid to holders
        uint256 amount;
        // True if distribution is equal, false if it's weighted
        bool isEqual;
        // Mapping showing that holder has withdrawn his dividends
        mapping(address => bool) hasClaimed;
        // Mapping showing how much tokens has each user claimed
        mapping(address => uint256) claimedAmount;
        // Copies the length of `lockers` set from the pool
        uint256 formulaLockers;
        // Copies the value of Pool.totalLocked when creating a distribution
        uint256 formulaLocked;
    }

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
    )
        external
        view
        returns (uint256, address, address, uint256, bool, uint256, uint256);

    /// @notice Checks if user has claimed dividends of the provided distribution
    /// @param id The ID of the distribution to check
    /// @param user The address of the user to check
    /// @return True if user has claimed dividends. Otherwise - false
    function hasClaimed(uint256 id, address user) external view returns (bool);

    /// @notice Returns the amount of dividends claimed by the user in particular distribution
    /// @param id The ID of the distribution to check
    /// @param user The address of the user
    /// @return The amount of dividends claimed by the user in the particular distribution
    function getClaimedAmount(
        uint256 id,
        address user
    ) external view returns (uint256);

    /// @notice Returns IDs of distributions before which
    ///         user's lock of the token has changed
    /// @param token The address of the token to get the lock of
    /// @param user The address of the user to get the lock history of
    function getLockChangesId(
        address token,
        address user
    ) external view returns (uint256[] memory);

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
    event PoolCreated(address token);

    /// @dev Indicates that a pool has been deleted
    event PoolDeleted(address token);

    /// @dev Indicated that tokens have been locked
    event TokensLocked(uint256 id, address user, address token, uint256 amount);

    /// @dev Indicated that tokens have been locked
    event TokensUnlocked(
        uint256 id,
        address user,
        address token,
        uint256 amount
    );

    /// @dev Indicates that new dividends distribution was started
    /// @param id The id of the started distribution
    /// @param origToken The tokens to the holders of which the dividends will be paid
    /// @param distToken The token that will be paid
    /// @param amount The amount of tokens that will be paid
    /// @param isEqual Indicates whether distribution will be equal
    event DividendsStarted(
        uint256 id,
        address origToken,
        address distToken,
        uint256 amount,
        bool isEqual
    );

    /// @dev Indicates that dividends were claimed by a user
    /// @param id The ID of the distribution that was claimed
    /// @param user The address of the user who claimed the distribution
    /// @param share The amount of tokens claimed
    event DividendsClaimed(uint256 id, address user, uint256 share);

    /// @dev Indicates that multiple dividends were claimed by a user
    /// @param ids The list of IDs of claimed dividends
    /// @param user The address of the user who claimed the distributions
    /// @param count The total number of claimed dividends
    event MultipleDividendsClaimed(uint256[] ids, address user, uint256 count);

    /// @dev Indicates that custom dividends were sent to the list of users
    /// @param id The ID of custom distribution
    /// @param token The token distributed
    /// @param count The total number of users who received their shares
    ///              Counting starts from the first user and does not skip any users
    event CustomDividendsDistributed(uint256 id, address token, uint256 count);

    /// @dev Indicates that 2/3 of block gas limit was spent during the
    ///      iteration inside the contract method
    /// @param gasLeft How much gas was used
    /// @param gasLimit The block gas limit
    event GasLimitReached(uint256 gasLeft, uint256 gasLimit);
}
