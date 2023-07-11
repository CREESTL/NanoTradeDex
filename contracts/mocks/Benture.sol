// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "./BentureProducedToken.sol";
import "./interfaces/IBenture.sol";

/// @title Dividends distributing contract
contract Benture is
    IBenture,
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    /// @notice Address of the factory used for projects creation
    address public factory;

    /// @dev All pools
    mapping(address => Pool) private pools;

    /// @dev Incrementing IDs of distributions
    CountersUpgradeable.Counter private distributionIds;
    /// @dev Mapping from distribution ID to the address of the admin
    ///      who started the distribution
    mapping(uint256 => address) private distributionsToAdmins;
    /// @dev Mapping from admin address to the list of IDs of active distributions he started
    mapping(address => uint256[]) private adminsToDistributions;
    /// @dev Mapping from distribution ID to the distribution
    mapping(uint256 => Distribution) private distributions;

    /// @dev Checks that caller is either an admin of a project or a factory
    modifier onlyAdminOrFactory(address token) {
        // Check if token has a zero address. If so, there is no way to
        // verify that caller is admin because it's impossible to
        // call verification method on zero address
        if (token == address(0)) {
            revert InvalidTokenAddress();
        }
        // If factory address is zero, that means that it hasn't been set
        if (factory == address(0)) {
            revert FactoryAddressNotSet();
        }
        // If caller is neither a factory nor an admin - revert
        if (
            !(msg.sender == factory) &&
            !(IBentureProducedToken(token).checkAdmin(msg.sender))
        ) {
            revert CallerNotAdminOrFactory();
        }
        _;
    }

    /// @dev The contract must be able to receive ether to pay dividends with it
    receive() external payable {}

    /// @notice Initialize all parent contracts
    function initialize() public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
    }

    /// @notice See {IBenture-getPool}
    function getPool(
        address token
    ) external view returns (address, uint256, uint256) {
        if (token == address(0)) {
            revert InvalidTokenAddress();
        }

        Pool storage pool = pools[token];
        return (pool.token, pool.lockers.length(), pool.totalLocked);
    }

    /// @notice See {IBenture-getLockers}
    function getLockers(
        address token
    ) external view returns (address[] memory) {
        if (token == address(0)) {
            revert InvalidTokenAddress();
        }

        return pools[token].lockers.values();
    }

    /// @notice See {IBenture-getCurrentLock}
    function getCurrentLock(
        address token,
        address user
    ) external view returns (uint256) {
        if (token == address(0)) {
            revert InvalidTokenAddress();
        }
        if (user == address(0)) {
            revert InvalidUserAddress();
        }
        return pools[token].lockedByUser[user];
    }

    /// @notice See {IBenture-getDistributions}
    function getDistributions(
        address admin
    ) external view returns (uint256[] memory) {
        // Do not check wheter the given address is actually an admin
        if (admin == address(0)) {
            revert InvalidAdminAddress();
        }
        return adminsToDistributions[admin];
    }

    /// @notice See {IBenture-getDistribution}
    function getDistribution(
        uint256 id
    )
        external
        view
        returns (uint256, address, address, uint256, bool, uint256, uint256)
    {
        if (id < 1) {
            revert InvalidDistributionId();
        }
        if (distributionsToAdmins[id] == address(0)) {
            revert DistributionNotStarted();
        }
        Distribution storage distribution = distributions[id];
        return (
            distribution.id,
            distribution.origToken,
            distribution.distToken,
            distribution.amount,
            distribution.isEqual,
            distribution.formulaLockers,
            distribution.formulaLocked
        );
    }

    /// @notice See {IBenture-checkStartedByAdmin}
    function checkStartedByAdmin(
        uint256 id,
        address admin
    ) external view returns (bool) {
        if (id < 1) {
            revert InvalidDistributionId();
        }
        if (distributionsToAdmins[id] == address(0)) {
            revert DistributionNotStarted();
        }
        if (admin == address(0)) {
            revert InvalidAdminAddress();
        }
        if (distributionsToAdmins[id] == admin) {
            return true;
        }
        return false;
    }

    /// @notice See {IBenture-getMyShare}
    function getMyShare(uint256 id) external view returns (uint256) {
        if (id > distributionIds.current()) {
            revert InvalidDistribution();
        }
        // Only lockers might have shares
        if (!isLocker(distributions[id].origToken, msg.sender)) {
            revert CallerIsNotLocker();
        }
        return _calculateShare(id, msg.sender);
    }

    /// @notice See {IBenture-lockAllTokens}
    function lockAllTokens(address origToken) external {
        uint256 wholeBalance = IERC20Upgradeable(origToken).balanceOf(
            msg.sender
        );
        lockTokens(origToken, wholeBalance);
    }

    /// @notice See {IBenture-unlockTokens}
    function unlockTokens(
        address origToken,
        uint256 amount
    ) external nonReentrant {
        _unlockTokens(origToken, amount);
    }

    /// @notice See {IBenture-unlockAllTokens}
    function unlockAllTokens(address origToken) external {
        // Get the last lock of the user
        uint256 wholeBalance = pools[origToken].lockedByUser[msg.sender];
        // Unlock that amount (could be 0)
        _unlockTokens(origToken, wholeBalance);
    }

    /// @notice See {IBenture-createPool}
    function createPool(address token) external onlyAdminOrFactory(token) {
        if (token == address(0)) {
            revert InvalidTokenAddress();
        }

        emit PoolCreated(token);

        Pool storage newPool = pools[token];
        // Check that this pool has not yet been initialized with the token
        // There can't multiple pools of the same token
        if (newPool.token == token) {
            revert PoolAlreadyExists();
        }
        newPool.token = token;
        // Other fields are initialized with default values
    }

    /// @notice See {IBenture-distributeDividends}
    function distributeDividends(
        address origToken,
        address distToken,
        uint256 amount,
        bool isEqual
    ) external payable nonReentrant {
        if (origToken == address(0)) {
            revert InvalidTokenAddress();
        }
        // Check that caller is an admin of `origToken`
        if (!IBentureProducedToken(origToken).checkAdmin(msg.sender)) {
            revert UserDoesNotHaveAnAdminToken();
        }
        // Amount can not be zero
        if (amount == 0) {
            revert InvalidDividendsAmount();
        }
        // No dividends can be distributed if there are no lockers in the pool
        if (pools[origToken].lockers.length() == 0) {
            revert NoLockersInThePool();
        }
        if (distToken != address(0)) {
            // NOTE: Caller should approve transfer of at least `amount` of tokens with `ERC20.approve()`
            // before calling this function
            // Transfer tokens from admin to the contract
            IERC20Upgradeable(distToken).safeTransferFrom(
                msg.sender,
                address(this),
                amount
            );
        } else {
            // Check that enough native tokens were provided
            if (msg.value < amount) {
                revert NotEnoughNativeTokens();
            }
        }

        distributionIds.increment();
        // NOTE The lowest distribution ID is 1
        uint256 distributionId = distributionIds.current();

        emit DividendsStarted(
            distributionId,
            origToken,
            distToken,
            amount,
            isEqual
        );

        // Mark that this admin started a distribution with the new ID
        distributionsToAdmins[distributionId] = msg.sender;
        adminsToDistributions[msg.sender].push(distributionId);
        // Create a new distribution
        Distribution storage newDistribution = distributions[distributionId];
        newDistribution.id = distributionId;
        newDistribution.origToken = origToken;
        newDistribution.distToken = distToken;
        newDistribution.amount = amount;
        newDistribution.isEqual = isEqual;
        // `hasClaimed` is initialized with default value
        newDistribution.formulaLockers = pools[origToken].lockers.length();
        newDistribution.formulaLocked = pools[origToken].totalLocked;
    }

    /// @notice See {IBenture-claimDividends}
    function claimDividends(uint256 id) external nonReentrant {
        _claimDividends(id);
    }

    /// @notice See {IBenture-claimMultipleDividends}
    function claimMultipleDividends(
        uint256[] memory ids
    ) external nonReentrant {
        _claimMultipleDividends(ids);
    }

    /// @notice See {IBenture-setFactoryAddress}
    function setFactoryAddress(address factoryAddress) external onlyOwner {
        if (factoryAddress == address(0)) {
            revert InvalidFactoryAddress();
        }
        factory = factoryAddress;
    }

    /// @notice See {IBenture-isLocker}
    function isLocker(address token, address user) public view returns (bool) {
        if (token == address(0)) {
            revert InvalidTokenAddress();
        }

        if (user == address(0)) {
            revert InvalidUserAddress();
        }
        // User is a locker if his lock is not a zero and he is in the lockers list
        return
            (pools[token].lockedByUser[user] != 0) &&
            (pools[token].lockers.contains(user));
    }

    /// @notice See {IBenture-hasClaimed}
    function hasClaimed(uint256 id, address user) public view returns (bool) {
        if (id < 1) {
            revert InvalidDistributionId();
        }
        if (distributionsToAdmins[id] == address(0)) {
            revert DistributionNotStarted();
        }
        if (user == address(0)) {
            revert InvalidUserAddress();
        }
        return distributions[id].hasClaimed[user];
    }

    /// @notice See {IBenture-getClaimedAmount}
    function getClaimedAmount(
        uint256 id,
        address user
    ) external view returns (uint256) {
        if (id < 1) {
            revert InvalidDistributionId();
        }
        if (distributionsToAdmins[id] == address(0)) {
            revert DistributionNotStarted();
        }
        if (user == address(0)) {
            revert InvalidUserAddress();
        }
        return distributions[id].claimedAmount[user];
    }

    /// @notice See {IBenture-getLockChangesId}
    function getLockChangesId(
        address token,
        address user
    ) public view returns (uint256[] memory) {
        return pools[token].lockChangesIds[user];
    }

    /// @notice See {IBenture-lockTokens}
    function lockTokens(address origToken, uint256 amount) public {
        if (amount == 0) {
            revert InvalidLockAmount();
        }
        // Token must have npn-zero address
        if (origToken == address(0)) {
            revert InvalidTokenAddress();
        }

        Pool storage pool = pools[origToken];
        // Check that a pool to lock tokens exists
        if (pool.token == address(0)) {
            revert PoolDoesNotExist();
        }
        // Check that pool holds the same token. Just in case
        if (pool.token != origToken) {
            revert WrongTokenInsideThePool();
        }
        // User should have origTokens to be able to lock them
        if (!IBentureProducedToken(origToken).isHolder(msg.sender)) {
            revert UserDoesNotHaveProjectTokens();
        }

        // If user has never locked tokens, add him to the lockers list
        if (!isLocker(pool.token, msg.sender)) {
            pool.lockers.add(msg.sender);
        }
        // Increase the total amount of locked tokens
        pool.totalLocked += amount;

        // Get user's current lock, increase it and copy to the history
        pool.lockedByUser[msg.sender] += amount;
        pool.lockHistory[msg.sender][distributionIds.current() + 1] = pool
            .lockedByUser[msg.sender];

        // Mark that the lock amount was changed before the next distribution
        // Avoid duplicates by checking the presence of the ID in the array
        if (!pool.changedBeforeId[msg.sender][distributionIds.current() + 1]) {
            pool.lockChangesIds[msg.sender].push(distributionIds.current() + 1);
        }
        // Mark that current ID is in the array now
        pool.changedBeforeId[msg.sender][distributionIds.current() + 1] = true;

        emit TokensLocked(
            distributionIds.current() + 1,
            msg.sender,
            origToken,
            amount
        );

        // NOTE: User must approve transfer of at least `amount` of tokens
        //       before calling this function
        // Transfer tokens from user to the contract
        IERC20Upgradeable(origToken).safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );
    }

    /// @notice See {IBenture-distributeDividendsCustom}
    function distributeDividendsCustom(
        address token,
        address[] calldata users,
        uint256[] calldata amounts
    ) public payable nonReentrant {
        // The amount of gas spent for all operations below
        uint256 gasSpent = 0;
        // Only 2/3 of block gas limit could be spent.
        uint256 gasThreshold = (block.gaslimit * 2) / 3;

        // Lists can't be empty
        if ((users.length == 0) || (amounts.length == 0)) {
            revert EmptyList();
        }
        // Lists length should be the same
        if (users.length != amounts.length) {
            revert ListsLengthDiffers();
        }

        uint256 lastGasLeft = gasleft();
        uint256 count;

        // Distribute dividends to each of the holders
        for (uint256 i = 0; i < users.length; i++) {
            // Users cannot have zero addresses
            if (users[i] == address(0)) {
                revert InvalidUserAddress();
            }
            // Amount for any user cannot be 0
            if (amounts[i] == 0) {
                revert InvalidDividendsAmount();
            }
            if (token == address(0)) {
                // Native tokens (wei)
                (bool success, ) = users[i].call{value: amounts[i]}("");
                if (!success) {
                    revert NativeTokenTransferFailed();
                }
            } else {
                // NOTE: Admin has to approve transfer of at least (sum of `amounts`) tokens
                //       for this contract address
                // Other ERC20 tokens
                IERC20Upgradeable(token).safeTransferFrom(
                    msg.sender,
                    users[i],
                    amounts[i]
                );
            }
            // Increase the number of users who received their shares
            count++;

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

        distributionIds.increment();
        // NOTE The lowest distribution ID is 1
        uint256 distributionId = distributionIds.current();

        emit CustomDividendsDistributed(
            distributionId,
            token,
            users,
            amounts,
            count
        );
    }

    /// @notice Shows which distributions the user took part in and hasn't claimed them
    /// @param user The address of the user to get distributions for
    /// @param token The address of the token that was distributed
    /// @return The list of IDs of distributions the user took part in
    function _getParticipatedNotClaimed(
        address user,
        address token
    ) private view returns (uint256[] memory) {
        Pool storage pool = pools[token];
        // Get the list of distributions before which user's lock was changed
        uint256[] memory allIds = pool.lockChangesIds[user];
        // If the last distribution has not started yet - delete it
        // User couldn't take part in it
        if (allIds[allIds.length - 1] > distributionIds.current()) {
            // If there is only one distribution before which user has locked his tokens
            // and it has not started yet - delete it, return empty array
            if (allIds.length == 1) {
                return new uint256[](0);
            }
            uint256[] memory temp = new uint256[](allIds.length - 1);
            for (uint256 i = 0; i < temp.length; i++) {
                temp[i] = allIds[i];
            }
            allIds = temp;
        }

        // If there is only one such distribution that means that
        // this was only one distribution in total and it has started
        // Check that he hasn't claimed
        if (allIds.length == 1) {
            if (distributions[allIds[0]].hasClaimed[user]) {
                return new uint256[](0);
            }
        }

        // If there are more than 1 IDs in the array, that means that at least
        // one distribution has started

        // Get the history of user's lock amount changes
        mapping(uint256 => uint256) storage amounts = pool.lockHistory[user];

        // First iteration: just *count* the amount of distributions the user took part in
        // Left and right borders of search

        uint256 counter;
        // If the first ID wasn't claimed, add it to the list and increase the counter
        if (hasClaimed(allIds[0], user)) {
            counter = 0;
        } else {
            counter = 1;
        }
        for (uint256 i = 1; i < allIds.length; i++) {
            if (amounts[allIds[i]] != 0) {
                if (amounts[allIds[i - 1]] != 0) {
                    // If lock for the ID is not 0 and for previous ID it's not 0 as well
                    // than means that user took part in all IDs between these two
                    for (
                        uint256 j = allIds[i - 1] + 1;
                        j < allIds[i] + 1;
                        j++
                    ) {
                        if (!hasClaimed(j, user)) {
                            counter++;
                        }
                    }
                } else {
                    // If lock for the ID is not 0, but for the previous ID it is 0, that means
                    // that user increased his lock to non-zero only now, so he didn't take part in
                    // any previous IDs
                    if (!hasClaimed(allIds[i], user)) {
                        counter++;
                    }
                }
            } else {
                if (amounts[allIds[i - 1]] != 0) {
                    // If lock for the ID is 0 and is not 0 for the previous ID, that means that
                    // user has unlocked all his tokens and didn't take part in the ID
                    for (uint256 j = allIds[i - 1] + 1; j < allIds[i]; j++) {
                        if (!hasClaimed(j, user)) {
                            counter++;
                        }
                    }
                }
            }
        }

        if (amounts[allIds[allIds.length - 1]] != 0) {
            // If lock for the last ID isn't zero, that means that the user still has lock
            // in the pool till this moment and he took part in all IDs since then
            for (
                uint256 j = allIds[allIds.length - 1] + 1;
                j < distributionIds.current() + 1;
                j++
            ) {
                if (!hasClaimed(j, user)) {
                    counter++;
                }
            }
        }

        uint256[] memory tookPart = new uint256[](counter);

        // Second iteration: actually fill the array

        if (hasClaimed(allIds[0], user)) {
            counter = 0;
        } else {
            counter = 1;
            tookPart[0] = allIds[0];
        }
        for (uint256 i = 1; i < allIds.length; i++) {
            if (amounts[allIds[i]] != 0) {
                if (amounts[allIds[i - 1]] != 0) {
                    for (
                        uint256 j = allIds[i - 1] + 1;
                        j < allIds[i] + 1;
                        j++
                    ) {
                        if (!hasClaimed(j, user)) {
                            tookPart[counter] = j;
                            counter++;
                        }
                    }
                } else {
                    if (!hasClaimed(allIds[i], user)) {
                        tookPart[counter] = allIds[i];
                        counter++;
                    }
                }
            } else {
                if (amounts[allIds[i - 1]] != 0) {
                    for (uint256 j = allIds[i - 1] + 1; j < allIds[i]; j++) {
                        if (!hasClaimed(j, user)) {
                            tookPart[counter] = j;
                            counter++;
                        }
                    }
                }
            }
        }

        if (amounts[allIds[allIds.length - 1]] != 0) {
            for (
                uint256 j = allIds[allIds.length - 1] + 1;
                j < distributionIds.current() + 1;
                j++
            ) {
                if (!hasClaimed(j, user)) {
                    tookPart[counter] = j;
                    counter++;
                }
            }
        }

        // Now `tookPart` is the array of distributions in which user took part until
        // the last distribution before which the lock was changed. But there can be more!
        // Need to extend `tookPart` in this case

        // If the last distribution from `tookPart`
        // is less than the current distribution ID, that means that the user took part in all
        // distributions from that one and until the current one
        if (tookPart[tookPart.length - 1] <= distributionIds.current()) {
            // An array that copies `tookPart` and appends all new IDs
            // It's length is a sum of `tookPart` and the amount of new IDs to be addres
            uint256[] memory temp = new uint256[](
                tookPart.length +
                    (distributionIds.current()) -
                    tookPart[tookPart.length - 1]
            );
            uint256 incrementingPart = 1;
            for (uint256 i = 0; i < temp.length; i++) {
                // Copy `tookPart`
                if (i < tookPart.length) {
                    temp[i] = tookPart[i];
                    // Append new IDs
                } else {
                    temp[i] = temp[tookPart.length - 1] + incrementingPart;
                    incrementingPart++;
                }
            }

            tookPart = temp;
        }

        return tookPart;
    }

    /// @notice Unlocks the provided amount of user's tokens from the pool
    /// @param origToken The address of the token to unlock
    /// @param amount The amount of tokens to unlock
    function _unlockTokens(address origToken, uint256 amount) private {
        if (amount == 0) {
            revert InvalidUnlockAmount();
        }
        // Token must have npn-zero address
        if (origToken == address(0)) {
            revert InvalidTokenAddress();
        }

        Pool storage pool = pools[origToken];
        // Check that a pool to lock tokens exists
        if (pool.token == address(0)) {
            revert PoolDoesNotExist();
        }
        // Check that pool holds the same token. Just in case
        if (pool.token != origToken) {
            revert WrongTokenInsideThePool();
        }
        // Make sure that user has locked some tokens before
        if (!isLocker(pool.token, msg.sender)) {
            revert NoLockedTokens();
        }

        // Make sure that user is trying to withdraw no more tokens than he has locked for now
        if (pool.lockedByUser[msg.sender] < amount) {
            revert WithdrawTooBig();
        }

        // Any unlock triggers claim of all dividends inside the pool for that user

        // Get the list of distributions the user took part in and hasn't claimed them
        uint256[] memory notClaimedIds = _getParticipatedNotClaimed(
            msg.sender,
            origToken
        );

        // Now claim all dividends of these distributions
        _claimMultipleDividends(notClaimedIds);

        // Decrease the total amount of locked tokens in the pool
        pool.totalLocked -= amount;

        // Get the current user's lock, decrease it and copy to the history
        pool.lockedByUser[msg.sender] -= amount;
        pool.lockHistory[msg.sender][distributionIds.current() + 1] = pool
            .lockedByUser[msg.sender];

        // Mark that the lock amount was changed before the next distribution
        // Avoid duplicates by checking the presence of the ID in the array
        if (!pool.changedBeforeId[msg.sender][distributionIds.current() + 1]) {
            pool.lockChangesIds[msg.sender].push(distributionIds.current() + 1);
        }
        // Mark that current ID is in the array now
        pool.changedBeforeId[msg.sender][distributionIds.current() + 1] = true;

        // If all tokens were unlocked - delete user from lockers list
        if (pool.lockedByUser[msg.sender] == 0) {
            // Delete it from the set as well
            pool.lockers.remove(msg.sender);
        }

        emit TokensUnlocked(
            distributionIds.current() + 1,
            msg.sender,
            origToken,
            amount
        );

        // Transfer unlocked tokens from contract to the user
        IERC20Upgradeable(origToken).safeTransfer(msg.sender, amount);
    }

    /// @dev Searches for the distribution that has an ID less than the `id`
    ///      but greater than all other IDs less than `id` and before which user's
    ///      lock amount was changed the last time. Returns the ID of that distribution
    ///      or (-1) if no such ID exists.
    ///      Performs a binary search.
    /// @param user The user to find a previous distribution for
    /// @param id The ID of the distribution to find a previous distribution for
    /// @return The ID of the found distribution. Or (-1) if no such distribution exists
    function _findMaxPrev(
        address user,
        uint256 id
    ) private view returns (int256) {
        address origToken = distributions[id].origToken;

        uint256[] storage ids = pools[origToken].lockChangesIds[user];

        // If the array is empty, there can't be a correct ID we're looking for in it
        if (ids.length == 0) {
            return -1;
        }

        // Start binary search
        uint256 low = 0;
        uint256 high = pools[origToken].lockChangesIds[user].length;

        while (low < high) {
            uint256 mid = MathUpgradeable.average(low, high);
            if (pools[origToken].lockChangesIds[user][mid] > id) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }

        // After this loop `low` is the array index of the ID that is *greater* than the `id`.
        // (and we're looking for the one that is *less* than the `id`)

        // IDs are sorted in the ascending order.
        // If `low` is 0, that means that the first ID in the array is
        //    greater than the `id`. Thus there are no any IDs in the array that may be *less* than the `id`
        if (low == 0) {
            return -1;
        }

        // If the array actually contains the `id` at index N, that means that a greater value is located at the
        // N + 1 index in the array (which is `low`) and the *smaller* value is located at the N - 1
        // index in the array (which is `low - 2`)
        if (pools[origToken].changedBeforeId[user][id]) {
            // If `low` is 1, that means that the `id` is the first element of the array (index 0).
            // Thus there are no any IDs in the array that may be *less* then `id`
            if (low == 1) {
                return -1;
            }
            // If `low` is greater then 1, that means that there can be elements of the array at indexes
            // of `low - 2` that are less than the `id`
            return int256(ids[low - 2]);
            // If the array does not contain the `id` at index N (that is also possible if user's lock was not changed before that `id`),
            // that means that a greater value is located at the N + 1 index in the array (which is `low`) and the *smaller* value is located
            // at the *N* index in the array (which is `low - 1`)
            // The lowest possible value of `low` here is 1. 0 is excluded by one of the conditions above
        } else {
            return int256(ids[low - 1]);
        }
    }

    /// @notice Calculates locker's share in the distribution
    /// @param id The ID of the distribution to calculates shares in
    /// @param user The address of the user whos share has to be calculated
    function _calculateShare(
        uint256 id,
        address user
    ) private view returns (uint256) {
        if (id > distributionIds.current()) {
            revert InvalidDistribution();
        }
        if (user == address(0)) {
            revert InvalidUserAddress();
        }

        Distribution storage distribution = distributions[id];

        Pool storage pool = pools[distribution.origToken];

        uint256 share;

        // Calculate shares if equal distribution
        if (distribution.isEqual) {
            // NOTE: result gets rounded towards zero
            // If the `amount` is less than `formulaLockers` then share is 0
            share = distribution.amount / distribution.formulaLockers;
            // Calculate shares in weighted distribution
        } else {
            // Get the amount locked by the user before the given distribution
            uint256 lock = pool.lockHistory[user][id];

            // If lock is zero, that means:
            // 1) The user has unlocked all his tokens before the given distribution
            // OR
            // 2) The user hasn't called either lock or unlock functions before the given distribution
            //    and because of that his locked amount was not updated in the mapping
            // So we have to determine which option is the right one
            if (lock == 0) {
                // Check if user has changed his lock amount before the distribution
                if (pool.changedBeforeId[user][id]) {
                    // If he did, and his current lock is 0, that means that he has unlocked all his tokens and 0 is a correct lock amount
                    lock = 0;
                } else {
                    // If he didn't, that means that *we have to use his lock from the closest distribution from the past*
                    // We have to find a distribution that has an ID that is less than `id` but greater than all other
                    // IDs less than `id`
                    int256 prevMaxId = _findMaxPrev(user, id);
                    if (prevMaxId != -1) {
                        lock = pool.lockHistory[user][uint256(prevMaxId)];
                    } else {
                        // If no such an ID exists (i.e. there were no distributions before the current one that had non-zero locks before them)
                        // that means that a user has *locked and unlocked* his tokens before the very first distribution. In this case 0 is a correct lock amount
                        lock = 0;
                    }
                }
            }

            share = (distribution.amount * lock) / distribution.formulaLocked;
        }

        return share;
    }

    function _claimDividends(uint256 id) private {
        // Can't claim a distribution that has not started yet
        if (id > distributionIds.current()) {
            revert DistributionHasNotStartedYet();
        }

        Distribution storage distribution = distributions[id];

        // User must be a locker of the `origToken` of the distribution he's trying to claim
        if (!isLocker(distribution.origToken, msg.sender)) {
            revert UserDoesNotHaveLockedTokens();
        }

        // User can't claim the same distribution more than once
        if (distribution.hasClaimed[msg.sender]) {
            revert AlreadyClaimed();
        }

        // Calculate the share of the user
        uint256 share = _calculateShare(id, msg.sender);

        // If user's share is 0, that means he doesn't have any locked tokens
        if (share == 0) {
            revert UserDoesNotHaveLockedTokens();
        }

        emit DividendsClaimed(id, msg.sender, share);

        distribution.hasClaimed[msg.sender] = true;
        distribution.claimedAmount[msg.sender] += share;

        // Send the share to the user
        if (distribution.distToken == address(0)) {
            // Send native tokens
            (bool success, ) = msg.sender.call{value: share}("");
            if (!success) {
                revert NativeTokenTransferFailed();
            }
        } else {
            // Send ERC20 tokens
            IERC20Upgradeable(distribution.distToken).safeTransfer(
                msg.sender,
                share
            );
        }
    }

    function _claimMultipleDividends(uint256[] memory ids) private {
        // The amount of gas spent for all operations below
        uint256 gasSpent = 0;
        // Only 2/3 of block gas limit could be spent.
        uint256 gasThreshold = (block.gaslimit * 2) / 3;

        uint256 lastGasLeft = gasleft();
        uint256 count;

        for (uint256 i = 0; i < ids.length; i++) {
            _claimDividends(ids[i]);
            // Increase the number of users who received their shares
            count++;
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

        emit MultipleDividendsClaimed(ids, msg.sender, count);
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}
}
