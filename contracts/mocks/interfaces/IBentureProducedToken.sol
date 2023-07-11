// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./errors/IBentureProducedTokenErrors.sol";

/// @title An interface for a custom ERC20 contract used in the bridge
interface IBentureProducedToken is IERC20, IBentureProducedTokenErrors {
    /// @notice Returns the name of the token
    /// @return The name of the token
    function name() external view returns (string memory);

    /// @notice Returns the symbol of the token
    /// @return The symbol of the token
    function symbol() external view returns (string memory);

    /// @notice Returns number of decimals of the token
    /// @return The number of decimals of the token
    function decimals() external view returns (uint8);

    /// @notice Returns IPFS URL with project metadata
    /// @return IPFS URL with project metadata
    function ipfsUrl() external view returns (string memory);

    /// @notice Indicates whether the token is mintable or not
    /// @return True if the token is mintable. False - if it is not
    function mintable() external view returns (bool);

    /// @notice Returns the array of addresses of all token holders
    /// @return The array of addresses of all token holders
    function holders() external view returns (address[] memory);

    /// @notice Returns the max total supply of the token
    /// @return The max total supply of the token
    function maxTotalSupply() external view returns (uint256);

    /// @notice Checks if the address is a holder
    /// @param account The address to check
    /// @return True if address is a holder. False if it is not
    function isHolder(address account) external view returns (bool);

    /// @notice Checks if user is an admin of this token
    /// @param account The address to check
    /// @return True if user has admin token. Otherwise - false.
    function checkAdmin(address account) external view returns (bool);

    /// @notice Creates tokens and assigns them to account, increasing the total supply.
    /// @param to The receiver of tokens
    /// @param amount The amount of tokens to mint
    /// @dev Can only be called by the owner of the admin NFT
    /// @dev Can only be called when token is mintable
    function mint(address to, uint256 amount) external;

    /// @notice Burns user's tokens
    /// @param amount The amount of tokens to burn
    function burn(uint256 amount) external;

    /// @notice Indicates that ERC20 tokens of new prokect were minted
    event ProjectTokenMinted(address account, uint256 amount);

    /// @notice Indicates that ERC20 of new project were burnt
    event ProjectTokenBurnt(address account, uint256 amount);

    /// @notice Indicates that a new ERC20 was transferred
    event ProjectTokenTransferred(address from, address to, uint256 amount);
}
