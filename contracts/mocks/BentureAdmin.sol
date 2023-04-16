// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/StringsUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "./interfaces/IBentureProducedToken.sol";
import "./interfaces/IBentureAdmin.sol";

/// @title A custom ERC721 contract that allows to mint controlled ERC20 tokens
contract BentureAdmin is
    IBentureAdmin,
    Initializable,
    ERC721Upgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;
    using StringsUpgradeable for uint256;

    /// @dev Incrementing IDs of admin tokens
    CountersUpgradeable.Counter private _tokenIds;
    /// @dev Mapping from ERC721 token IDs to controlled ERC20 token addresses
    mapping(uint256 => address) private _adminToControlled;
    /// @dev Reverse mapping for `_adminToControlled`
    mapping(address => uint256) private _controlledToAdmin;
    /// @dev Mapping from admin address to IDs of admin tokens he owns
    /// @dev One admin can control several projects
    mapping(address => EnumerableSetUpgradeable.UintSet) private _holderToIds;
    /// @dev Reverse mapping for `_holderToIds`
    mapping(uint256 => address) private _idToHolder;
    /// @dev Mapping of used ERC20 tokens addresses
    mapping(address => bool) private _usedControlled;
    /// @dev The address of the factory minting admin tokens
    address private _factoryAddress;

    /// @dev Checks if caller is a factory address
    modifier onlyFactory() {
        if (msg.sender != _factoryAddress) {
            revert CallerIsNotAFactory();
        }
        _;
    }

    /// @dev Creates an "empty" NFT
    /// @param factoryAddress_ The address of the factory minting admin tokens
    function initialize(address factoryAddress_) public initializer {
        __ERC721_init("Benture Manager Token", "BMNG");
        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        if (factoryAddress_ == address(0)) {
            revert InvalidFactoryAddress();
        }
        _factoryAddress = factoryAddress_;
    }

    /// @notice Checks it the provided address owns any admin token
    function checkOwner(address user) external view {
        if (user == address(0)) {
            revert InvalidUserAddress();
        }
        if (_holderToIds[user].length() == 0) {
            revert UserDoesNotHaveAnAdminToken();
        }
    }

    /// @notice Checks if the provided user owns an admin token controlling the provided ERC20 token
    /// @param user The address of the user that potentially controls ERC20 token
    /// @param ERC20Address The address of the potentially controlled ERC20 token
    /// @return True if user has admin token. Otherwise - false.
    function verifyAdminToken(
        address user,
        address ERC20Address
    ) external view returns (bool) {
        if (user == address(0)) {
            revert InvalidUserAddress();
        }
        if (ERC20Address == address(0)) {
            revert InvalidTokenAddress();
        }
        // Get the ID of the admin token for the provided ERC20 token address
        // No need to check if ID is 0 here
        uint256 id = _controlledToAdmin[ERC20Address];
        // Get the actual holder of the token with that ID and compare it to the provided user address
        if (_idToHolder[id] != user) {
            return false;
        }
        return true;
    }

    /// @notice Returns the address of the controlled ERC20 token
    /// @param tokenId The ID of ERC721 token to check
    /// @return The address of the controlled ERC20 token
    function getControlledAddressById(
        uint256 tokenId
    ) external view returns (address) {
        if (_adminToControlled[tokenId] == address(0)) {
            revert NoControlledToken();
        }
        _requireMinted(tokenId);

        return _adminToControlled[tokenId];
    }

    /// @notice Returns the list of all admin tokens of the user
    /// @param admin The address of the admin
    function getAdminTokenIds(
        address admin
    ) external view returns (uint256[] memory) {
        if (admin == address(0)) {
            revert InvalidAdminAddress();
        }
        return _holderToIds[admin].values();
    }

    /// @notice Returns the address of the factory that mints admin tokens
    /// @return The address of the factory
    function getFactory() external view returns (address) {
        return _factoryAddress;
    }

    /// @notice Mints a new ERC721 token with the address of the controlled ERC20 token
    /// @param to The address of the receiver of the token
    /// @param ERC20Address The address of the controlled ERC20 token
    function mintWithERC20Address(
        address to,
        address ERC20Address
    ) external onlyFactory nonReentrant {
        if (to == address(0)) {
            revert MintToZeroAddressNotAllowed();
        }
        if (ERC20Address == address(0)) {
            revert InvalidTokenAddress();
        }
        if (_usedControlled[ERC20Address]) {
            revert OnlyOneAdminTokenForProjectToken();
        }
        _tokenIds.increment();
        // NOTE The lowest token ID is 1
        uint256 tokenId = _tokenIds.current();
        // Mark that controlled token has been used once
        _usedControlled[ERC20Address] = true;
        // Mark that token with the current ID belongs to the user
        _holderToIds[to].add(tokenId);
        _idToHolder[tokenId] = to;

        emit AdminTokenCreated(tokenId, ERC20Address);

        // Mint the token
        super._safeMint(to, tokenId);
        // Connect admin token ID to controlled ERC20 address
        setControlledAddress(tokenId, ERC20Address);
    }

    /// @notice Burns the token with the provided ID
    /// @param tokenId The ID of the token to burn
    function burn(uint256 tokenId) external {
        if (ownerOf(tokenId) != msg.sender) {
            revert NotAnOwner();
        }
        _requireMinted(tokenId);
        // NOTE: `delete` does not change the length of any array. It replaces a "deleted" item
        //        with a default value
        // Clean 4 mappings at once
        delete _controlledToAdmin[_adminToControlled[tokenId]];
        delete _adminToControlled[tokenId];
        // This deletes `tokenId` from the list of all IDs owned by the admin
        deleteOneId(_idToHolder[tokenId], tokenId);
        delete _idToHolder[tokenId];

        super._burn(tokenId);
        emit AdminTokenBurnt(tokenId);
    }

    /// @notice Creates a relatioship between controlled ERC20 token address and an admin ERC721 token ID
    /// @param tokenId The ID of the admin ERC721 token
    /// @param ERC20Address The address of the controlled ERC20 token
    function setControlledAddress(
        uint256 tokenId,
        address ERC20Address
    ) internal onlyFactory {
        if (ERC20Address == address(0)) {
            revert InvalidTokenAddress();
        }
        _requireMinted(tokenId);
        _adminToControlled[tokenId] = ERC20Address;
        _controlledToAdmin[ERC20Address] = tokenId;
    }

    /// @notice Deletes one admin token from the list of all project tokens owned by the admin
    /// @param admin The address of the admin of several projects
    /// @param tokenId The ID of the admin token to delete
    function deleteOneId(address admin, uint256 tokenId) internal {
        bool removed = _holderToIds[admin].remove(tokenId);
        if (!removed) {
            revert FailedToDeleteTokenID();
        }
    }

    /// @notice Transfers admin token with the provided ID from one address to another address
    /// @param from The address to transfer from
    /// @param to The address to transfer to
    /// @param tokenId The ID of the token to be transferred
    function _transfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override {
        if (from == address(0)) {
            revert InvalidUserAddress();
        }
        if (to == address(0)) {
            revert InvalidUserAddress();
        }
        _requireMinted(tokenId);
        // No need to check if sender has any admin tokens here because it is checked
        // in higher-level ERC721 functions such as `transferFrom` and `_safeTransfer`
        // The token moves to the other address
        _idToHolder[tokenId] = to;
        _holderToIds[to].add(tokenId);
        // Current holder loses one token
        deleteOneId(from, tokenId);

        super._transfer(from, to, tokenId);

        emit AdminTokenTransferred(from, to, tokenId);
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}
}
