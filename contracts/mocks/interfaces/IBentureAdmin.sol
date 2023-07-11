// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./errors/IBentureAdminErrors.sol";

/// @title An interface of a factory of custom ERC20 tokens;
interface IBentureAdmin is IBentureAdminErrors {
    /// @notice Checks it the provided address owns any admin token
    function checkOwner(address user) external view;

    /// @notice Checks if the provided user owns an admin token controlling the provided ERC20 token
    /// @param user The address of the user that potentially controls ERC20 token
    /// @param ERC20Address The address of the potentially controlled ERC20 token
    /// @return True if user has admin token. Otherwise - false.
    function checkAdminOfProject(
        address user,
        address ERC20Address
    ) external view returns (bool);

    /// @notice Checks if the provided token address is controlled ERC20 token
    /// @param ERC20Address The address of the potentially controlled ERC20 token
    /// @return True if provided token is an ERC20 controlled token. Otherwise - false.
    function checkIsControlled(
        address ERC20Address
    ) external view returns (bool);

    /// @notice Checks if the provided user is an admin of any project
    /// @param user The address of the user to check
    /// @return True if user is admin of any project. Otherwise - false
    function checkAdminOfAny(address user) external view returns (bool);

    /// @notice Returns the address of the controlled ERC20 token
    /// @param tokenId The ID of ERC721 token to check
    /// @return The address of the controlled ERC20 token
    function getControlledAddressById(
        uint256 tokenId
    ) external view returns (address);

    /// @notice Returns the list of all admin tokens of the user
    /// @param admin The address of the admin
    function getAdminTokenIds(
        address admin
    ) external view returns (uint256[] memory);

    /// @notice Returns the address of the factory that mints admin tokens
    /// @return The address of the factory
    function getFactory() external view returns (address);

    /// @notice Mints a new ERC721 token with the address of the controlled ERC20 token
    /// @param to The address of the receiver of the token
    /// @param ERC20Address The address of the controlled ERC20 token
    function mintWithERC20Address(address to, address ERC20Address) external;

    /// @notice Burns the token with the provided ID
    /// @param tokenId The ID of the token to burn
    function burn(uint256 tokenId) external;

    /// @dev Indicates that a new ERC721 token got minted
    event AdminTokenCreated(uint256 tokenId, address ERC20Address);

    /// @dev Indicates that an ERC721 token got burnt
    event AdminTokenBurnt(uint256 tokenId);

    /// @dev Indicates that an ERC721 token got transferred
    event AdminTokenTransferred(address from, address to, uint256 tokenId);
}
