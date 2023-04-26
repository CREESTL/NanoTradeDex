// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./BentureProducedToken.sol";
import "./interfaces/IBentureFactory.sol";
import "./interfaces/IBentureAdmin.sol";
import "./interfaces/IBenture.sol";

/// @title A factory of custom ERC20 tokens
contract BentureFactory is
    IBentureFactory,
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    /// @dev The address of the `Benture` contract
    address private bentureAddress;

    /// @dev The address of the last token that was produced by the factory
    address private _lastProducedToken;

    receive() external payable {}

    /// @notice See {IBentureFactory-lastProducedToken}
    function lastProducedToken() external view returns (address) {
        return _lastProducedToken;
    }

    /// @notice Set a `Benture` contract address
    /// @param bentureAddress_ The address of `Benture` contract
    function initialize(address bentureAddress_) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();

        if (bentureAddress_ == address(0)) {
            revert BentureAddressIsZero();
        }
        bentureAddress = bentureAddress_;
    }

    /// @notice See {IBentureFactory-createERC20Token}
    function createERC20Token(
        string memory name,
        string memory symbol,
        uint8 decimals,
        bool mintable,
        uint256 maxTotalSupply,
        address adminToken_
    ) external {
        BentureProducedToken newToken = new BentureProducedToken(
            name,
            symbol,
            decimals,
            mintable,
            maxTotalSupply,
            adminToken_
        );

        emit CreateERC20Token(
            name,
            symbol,
            address(newToken),
            decimals,
            mintable
        );

        // The address of the produced token gets changed each time
        _lastProducedToken = address(newToken);

        // Mint admin token to the creator of this ERC20 token
        IBentureAdmin(adminToken_).mintWithERC20Address(
            msg.sender,
            address(newToken)
        );

        IBenture(bentureAddress).createPool(address(newToken));
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}
}
