// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./errors/IBentureFactoryErrors.sol";

/// @title An interface of a factory of custom ERC20 tokens
interface IBentureFactory is IBentureFactoryErrors {
    /// @notice Returns the address of the produced ERC20 token
    /// @return The address of the produced ERC20 token
    function lastProducedToken() external view returns (address);

    /// @notice Creates a new ERC20 token and mints an admin token proving ownership
    /// @param name The name of the token
    /// @param symbol The symbol of the token
    /// @param ipfsUrl The URL to IPFS with project metadata
    /// @param decimals Number of decimals of the token
    /// @param mintable Token may be either mintable or not. Can be changed later.
    /// @param maxTotalSupply Maximum amount of tokens to be minted
    /// @param mintAmount Amount of tokens to be minted
    /// @param adminToken_ Address of the admin token for controlled token
    /// @dev Anyone can call this method. No restrictions.
    function createERC20Token(
        string memory name,
        string memory symbol,
        string memory ipfsUrl,
        uint8 decimals,
        bool mintable,
        uint256 maxTotalSupply,
        uint256 mintAmount,
        address adminToken_
    ) external;

    /// @dev Indicates that a new ERC20 token was created
    event CreateERC20Token(
        string name,
        string symbol,
        string ipfsUrl,
        address tokenAddress,
        uint8 decimals,
        bool mintable
    );
}
