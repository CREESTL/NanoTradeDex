// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

interface IBentureAdminErrors {
    error CallerIsNotAFactory();
    error InvalidFactoryAddress();
    error InvalidUserAddress();
    error InvalidAdminAddress();
    error UserDoesNotHaveAnAdminToken();
    error InvalidTokenAddress();
    error NoControlledToken();
    error FailedToDeleteTokenID();
    error MintToZeroAddressNotAllowed();
    error OnlyOneAdminTokenForProjectToken();
    error NotAnOwner();
}
