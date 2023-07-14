const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const { expect } = require("chai");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const {
    getTxHashMatch,
    getTxHashMarket,
    hashAndSignMatch,
    hashAndSignMarket,
    calcFeeAmount,
    calcBuyerLockAmount,
    calcBuyerSpentAmount,
    calcSellerSpentAmount,
} = require("./utils.js");
const { parseUnits, parseEther } = ethers.utils;
const zeroAddress = ethers.constants.AddressZero;
const randomAddress = "0x6ef46dc60e62CaaCaB5B4Eb6dfC772d4A039251D";
const getBalance = ethers.provider.getBalance;

// Initialize the backend account
const provider = ethers.getDefaultProvider();
const backendAcc = new ethers.Wallet(process.env.BACKEND_PRIVATE_KEY, provider);

let ipfsUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

// #H
describe("Benture DEX", () => {
    // Deploys all contracts, creates tokens, creates two orders, sets quoted tokens
    async function deploysQuotedB() {
        [ownerAcc, clientAcc1, clientAcc2, clientAcc3] =
            await ethers.getSigners();

        let dexTx = await ethers.getContractFactory("BentureDex");
        let dex = await dexTx.deploy();
        await dex.deployed();

        // Set backend address
        await dex.setBackend(backendAcc.address);

        // Deploy dividend-distribution contract
        let bentureTx = await ethers.getContractFactory("Benture");
        let benture = await upgrades.deployProxy(bentureTx, [], {
            initializer: "initialize",
            kind: "uups",
        });
        await benture.deployed();

        // Deploy a factory contract
        let factoryTx = await ethers.getContractFactory("BentureFactory");
        let factory = await upgrades.deployProxy(factoryTx, [benture.address], {
            initializer: "initialize",
            kind: "uups",
        });
        await factory.deployed();

        await benture.setFactoryAddress(factory.address);

        // Deploy an admin token (ERC721)
        let adminTx = await ethers.getContractFactory("BentureAdmin");
        let adminToken = await upgrades.deployProxy(
            adminTx,
            [factory.address],
            {
                initializer: "initialize",
                kind: "uups",
            }
        );
        await adminToken.deployed();

        // Set admin token for DEX
        await dex.setAdminToken(adminToken.address);

        // Max supply for all factory created tokens
        let maxSupply = parseEther("1000000000000000000");

        // Create new ERC20 and ERC721 and assign them to caller (owner)
        await factory.createERC20Token(
            "tokenA",
            "tokenA",
            ipfsUrl,
            18,
            true,
            maxSupply,
            // Provide the address of the previously deployed ERC721
            adminToken.address
        );

        // Get the address of the last ERC20 token produced in the factory
        let tokenAAddress = await factory.lastProducedToken();
        let tokenA = await ethers.getContractAt(
            "BentureProducedToken",
            tokenAAddress
        );

        // Deploy another ERC20 in order to have a tokenB
        await factory.createERC20Token(
            "tokenB",
            "tokenB",
            ipfsUrl,
            18,
            true,
            maxSupply,
            adminToken.address
        );

        let tokenBAddress = await factory.lastProducedToken();
        let tokenB = await ethers.getContractAt(
            "BentureProducedToken",
            tokenBAddress
        );

        // Premint tokens to owner and allow dex to spend all tokens
        let mintAmount = parseEther("1000000");
        await tokenA.mint(ownerAcc.address, mintAmount);
        await tokenB.mint(ownerAcc.address, mintAmount);
        await tokenA.approve(dex.address, mintAmount);
        await tokenB.approve(dex.address, mintAmount);

        // Start sales and create two pairs of tokens

        let initialLimitPriceAB = parseEther("1.5");
        let initialLimitPriceBA = parseEther("1.5");

        // ID1
        let sellAmount = parseEther("10");
        await dex
            .connect(ownerAcc)
            .startSaleSingle(
                tokenA.address,
                tokenB.address,
                sellAmount,
                initialLimitPriceAB
            );
        // ID2
        await dex
            .connect(ownerAcc)
            .startSaleSingle(
                tokenB.address,
                tokenA.address,
                sellAmount,
                initialLimitPriceBA
            );

        return {
            dex,
            adminToken,
            tokenA,
            tokenB,
        };
    }

    // Deploys all contracts, creates tokens, does not set any quoted tokens or create orders
    async function deploysNoQuoted() {
        [ownerAcc, clientAcc1, clientAcc2, clientAcc3] =
            await ethers.getSigners();

        let dexTx = await ethers.getContractFactory("BentureDex");
        let dex = await dexTx.deploy();
        await dex.deployed();

        // Set backend address
        await dex.setBackend(backendAcc.address);

        // Deploy dividend-distribution contract
        let bentureTx = await ethers.getContractFactory("Benture");
        let benture = await upgrades.deployProxy(bentureTx, [], {
            initializer: "initialize",
            kind: "uups",
        });
        await benture.deployed();

        // Deploy a factory contract
        let factoryTx = await ethers.getContractFactory("BentureFactory");
        let factory = await upgrades.deployProxy(factoryTx, [benture.address], {
            initializer: "initialize",
            kind: "uups",
        });
        await factory.deployed();

        await benture.setFactoryAddress(factory.address);

        // Deploy an admin token (ERC721)
        let adminTx = await ethers.getContractFactory("BentureAdmin");
        let adminToken = await upgrades.deployProxy(
            adminTx,
            [factory.address],
            {
                initializer: "initialize",
                kind: "uups",
            }
        );
        await adminToken.deployed();

        // Set admin token for DEX
        await dex.setAdminToken(adminToken.address);

        // Max supply for all factory created tokens
        let maxSupply = parseEther("1000000000000000000");

        // Create new ERC20 and ERC721 and assign them to caller (owner)
        await factory.createERC20Token(
            "tokenA",
            "tokenA",
            ipfsUrl,
            18,
            true,
            maxSupply,
            // Provide the address of the previously deployed ERC721
            adminToken.address
        );

        // Get the address of the last ERC20 token produced in the factory
        let tokenAAddress = await factory.lastProducedToken();
        let tokenA = await ethers.getContractAt(
            "BentureProducedToken",
            tokenAAddress
        );

        // Deploy another ERC20 in order to have a tokenB
        await factory.createERC20Token(
            "tokenB",
            "tokenB",
            ipfsUrl,
            18,
            true,
            maxSupply,
            adminToken.address
        );

        let tokenBAddress = await factory.lastProducedToken();
        let tokenB = await ethers.getContractAt(
            "BentureProducedToken",
            tokenBAddress
        );

        // Deploy another ERC20 in order to have a tokenC
        await factory.createERC20Token(
            "tokenC",
            "tokenC",
            ipfsUrl,
            18,
            true,
            maxSupply,
            adminToken.address
        );

        let tokenCAddress = await factory.lastProducedToken();
        let tokenC = await ethers.getContractAt(
            "BentureProducedToken",
            tokenCAddress
        );

        // Deploy another ERC20 in order to have a tokenD
        await factory.connect(clientAcc2).createERC20Token(
            "tokenD",
            "tokenD",
            ipfsUrl,
            18,
            true,
            maxSupply,
            adminToken.address
        );

        let tokenDAddress = await factory.lastProducedToken();
        let tokenD = await ethers.getContractAt(
            "BentureProducedToken",
            tokenDAddress
        );

        // Premint tokens to owner and allow dex to spend all tokens
        let mintAmount = parseEther("1000000");
        await tokenA.mint(ownerAcc.address, mintAmount);
        await tokenB.mint(ownerAcc.address, mintAmount);
        await tokenC.mint(ownerAcc.address, mintAmount);
        await tokenD.connect(clientAcc2).mint(clientAcc2.address, mintAmount);
        await tokenA.approve(dex.address, mintAmount);
        await tokenB.approve(dex.address, mintAmount);
        await tokenC.approve(dex.address, mintAmount);
        await tokenD.connect(clientAcc2).approve(dex.address, mintAmount);

        return {
            dex,
            adminToken,
            tokenA,
            tokenB,
            tokenC,
            tokenD
        };
    }

    // #D
    describe("Deployment", () => {
        it("Should deploy and have correct stats", async () => {
            let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                deploysQuotedB
            );

            expect(await dex.feeRate()).to.eq(10);
            expect(await dex.backendAcc()).to.eq(backendAcc.address);
            expect(await dex.adminToken()).to.eq(adminToken.address);
        });
    });

    // #M
    describe("Modifiers", () => {
        // #UQ
        describe("Update quotes", () => {
            it("Should update quoted token on first order creation", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                let buyAmount = parseEther("10");
                let slippage = 10;
                let limitPrice = parseEther("1.5");

                // Quotes updated here. `tokenB` is quoted
                await dex.buyLimit(
                    tokenA.address,
                    tokenB.address,
                    buyAmount,
                    limitPrice
                );

                let [quotedToken, price] = await dex.getPrice(
                    tokenA.address,
                    tokenB.address
                );
                expect(quotedToken).to.eq(tokenB.address);
            });
            it("Should not update existing quoted token", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                let buyAmount = parseEther("10");
                let slippage = 10;
                let limitPrice = parseEther("1.5");

                signatureMarket = await hashAndSignMarket(
                    dex.address,
                    tokenA.address,
                    tokenB.address,
                    buyAmount,
                    slippage,
                    888
                );

                // Try to set quoted token the 2nd time
                await dex.buyMarket(
                    tokenA.address,
                    tokenB.address,
                    buyAmount,
                    slippage,
                    888,
                    signatureMarket
                );

                let [quotedToken, price] = await dex.getPrice(
                    tokenA.address,
                    tokenB.address
                );
                expect(quotedToken).to.eq(tokenB.address);
            });
        });

        // #BC
        describe("Backend calls", () => {
            it("Should only allow backend to call some functions once", async () => {
                let nonce = 777;
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                let buyAmount = parseEther("10");
                let slippage = 10;
                let limitPrice = parseEther("1.5");

                // Suppose that this order is waiting in the orderbook
                // ID3
                await dex
                    .connect(ownerAcc)
                    .sellLimit(
                        tokenA.address,
                        tokenB.address,
                        buyAmount,
                        limitPrice
                    );

                let mintAmount = parseEther("1000000");
                await tokenA.mint(clientAcc1.address, mintAmount);
                await tokenB.mint(clientAcc1.address, mintAmount);

                await tokenA
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);
                await tokenB
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);

                let signatureMarket = await hashAndSignMarket(
                    dex.address,
                    tokenB.address,
                    tokenA.address,
                    buyAmount,
                    slippage,
                    777
                );

                // This order is created and matched with the previous one
                // ID4
                await dex
                    .connect(clientAcc1)
                    .buyMarket(
                        tokenB.address,
                        tokenA.address,
                        buyAmount,
                        slippage,
                        777,
                        signatureMarket
                    );

                let signatureMatch = await hashAndSignMatch(
                    dex.address,
                    4,
                    [3],
                    777
                );
                await dex.matchOrders(4, [3], nonce, signatureMatch);

                // Second call should fail
                await expect(
                    dex.matchOrders(4, [3], nonce, signatureMatch)
                ).to.be.revertedWithCustomError(dex, "TxAlreadyExecuted");
            });

            it("Should fail to call functions if signature is invalid", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                let nonce = 777;
                // Use client address instead of dex here
                let signature = await hashAndSignMatch(
                    clientAcc1.address,
                    2,
                    [1],
                    nonce
                );

                await expect(
                    dex.matchOrders(2, [1], nonce, signature)
                ).to.be.revertedWithCustomError(dex, "InvalidSignature");
            });
        });

        describe("Only allow orders when pair exists", () => {
            it("Should check that pair exists before order creation", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                let buyAmount = parseEther("10");
                let slippage = 10;
                let limitPrice = parseEther("1.5");

                let signatureMarket = await hashAndSignMarket(
                    dex.address,
                    adminToken.address,
                    zeroAddress,
                    buyAmount,
                    slippage,
                    777
                );

                await expect(
                    dex
                        .connect(clientAcc1)
                        .buyMarket(
                            adminToken.address,
                            zeroAddress,
                            buyAmount,
                            slippage,
                            777,
                            signatureMarket
                        )
                ).to.be.revertedWithCustomError(dex, "PairNotCreated");
            });
        });
        describe("Allow only admins to start sales", () => {
            it("Should fail to start a single sale if caller is not admin of any project", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                let sellAmount = parseEther("10");
                let limitPrice = parseEther("1.5");

                await expect(
                    dex
                        .connect(clientAcc1)
                        .startSaleSingle(
                            tokenA.address,
                            tokenB.address,
                            sellAmount,
                            limitPrice
                        )
                ).to.be.revertedWithCustomError(dex, "NotAdmin");
            });
        });
    });

    // #S
    describe("Setters", () => {
        describe("Set fee rate", () => {
            it("Should set new fee", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );
                let oldFee = await dex.feeRate();
                await expect(dex.setFee(oldFee.mul(2)))
                    .to.emit(dex, "FeeRateChanged")
                    .withArgs(oldFee, oldFee.mul(2));
                let newFee = await dex.feeRate();
                expect(newFee.div(oldFee)).to.eq(2);
            });

            it("Should fail to set new fee if caller is not owner", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );
                let oldFee = await dex.feeRate();
                await expect(
                    dex.connect(clientAcc1).setFee(oldFee.mul(2))
                ).to.be.revertedWith("Ownable: caller is not the owner");
            });
        });

        describe("Set backend", () => {
            it("Should set new backend", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );
                let oldBackend = await dex.backendAcc();
                await expect(dex.setBackend(randomAddress))
                    .to.emit(dex, "BackendChanged")
                    .withArgs(backendAcc.address, randomAddress);
                let newBackend = await dex.backendAcc();
                expect(oldBackend).not.to.eq(newBackend);
                expect(newBackend).to.eq(randomAddress);
            });

            it("Should fail to set new backend if caller is not owner", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );
                await expect(
                    dex.connect(clientAcc1).setBackend(randomAddress)
                ).to.be.revertedWith("Ownable: caller is not the owner");
            });

            it("Should fail to set zero address backend", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );
                await expect(
                    dex.setBackend(zeroAddress)
                ).to.be.revertedWithCustomError(dex, "ZeroAddress");
            });
        });

        describe("Set admin token address", () => {
            it("Should set new admin token address", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );
                let oldAdminToken = await dex.adminToken();
                await expect(dex.setAdminToken(randomAddress))
                    .to.emit(dex, "AdminTokenChanged")
                    .withArgs(adminToken.address, randomAddress);
                let newAdminToken = await dex.adminToken();
                expect(oldAdminToken).not.to.eq(newAdminToken);
                expect(newAdminToken).to.eq(randomAddress);
            });
            it("Should fail to set new admin token address", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );
                await expect(
                    dex.setAdminToken(zeroAddress)
                ).to.be.revertedWithCustomError(dex, "ZeroAddress");
            });
        });
    });

    // #G
    describe("Getters", () => {
        describe("Get orders", () => {
            it("Should get orders created by a user", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                let buyAmount = parseEther("10");
                let slippage = 10;
                let limitPrice = parseEther("1.5");

                let mintAmount = parseEther("1000000");
                await tokenA.mint(clientAcc1.address, mintAmount);
                await tokenB.mint(clientAcc1.address, mintAmount);
                await tokenA
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);
                await tokenB
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);

                expect(
                    (await dex.getUserOrders(clientAcc1.address)).length
                ).to.eq(0);

                await dex
                    .connect(clientAcc1)
                    .sellLimit(
                        tokenA.address,
                        tokenB.address,
                        buyAmount,
                        limitPrice
                    );

                let signatureMarket = await hashAndSignMarket(
                    dex.address,
                    tokenB.address,
                    tokenA.address,
                    buyAmount,
                    slippage,
                    777
                );

                await dex
                    .connect(clientAcc1)
                    .buyMarket(
                        tokenB.address,
                        tokenA.address,
                        buyAmount,
                        slippage,
                        777,
                        signatureMarket
                    );

                let ids = await dex.getUserOrders(clientAcc1.address);
                expect(ids[0]).to.eq(3);
                expect(ids[1]).to.eq(4);
                expect(ids.length).to.eq(2);
            });

            it("Should fail to get orders of zero address user", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                await expect(
                    dex.getUserOrders(zeroAddress)
                ).to.be.revertedWithCustomError(dex, "ZeroAddress");
            });

            it("Should get order by id", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                let buyAmount = parseEther("10");
                let limitPrice = parseEther("1.5");

                let mintAmount = parseEther("1000000");
                await tokenA.mint(clientAcc1.address, mintAmount);
                await tokenB.mint(clientAcc1.address, mintAmount);
                await tokenA
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);
                await tokenB
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);

                await dex
                    .connect(clientAcc1)
                    .sellLimit(
                        tokenA.address,
                        tokenB.address,
                        buyAmount,
                        limitPrice
                    );

                let order = await dex.getOrder(3);

                let user = order[0];
                let firstToken = order[1];
                let secondToken = order[2];
                let amount = order[3];
                let amountFilled = order[4];
                let type = order[5];
                let side = order[6];
                let price = order[7];
                let isCancellable = order[8];
                let feeAmount = order[9];
                let lockedAmount = order[10];
                let status = order[11];

                let shouldBeLocked = buyAmount;
                let shouldBeFee = calcFeeAmount(shouldBeLocked);

                expect(user).to.eq(clientAcc1.address);
                expect(firstToken).to.eq(tokenA.address);
                expect(secondToken).to.eq(tokenB.address);
                expect(amount).to.eq(buyAmount);
                expect(amountFilled).to.eq(0);
                expect(type).to.eq(1);
                expect(side).to.eq(1);
                expect(price).to.eq(limitPrice);
                expect(isCancellable).to.eq(true);
                expect(feeAmount).to.eq(shouldBeFee);
                expect(lockedAmount).to.eq(shouldBeLocked);
                expect(status).to.eq(0);
            });

            it("Should fail to get unexisting order", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                await expect(dex.getOrder(777)).to.be.revertedWithCustomError(
                    dex,
                    "OrderDoesNotExist"
                );
            });

            it("Should get list of orders by tokens", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                let ids = await dex
                    .connect(clientAcc1)
                    .getOrdersByTokens(tokenA.address, tokenB.address);
                expect(ids.length).to.eq(1);

                let buyAmount = parseEther("10");
                let limitPrice = parseEther("1.5");

                let mintAmount = parseEther("1000000");
                await tokenA.mint(clientAcc1.address, mintAmount);
                await tokenB.mint(clientAcc1.address, mintAmount);
                await tokenA
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);
                await tokenB
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);

                await dex
                    .connect(clientAcc1)
                    .sellLimit(
                        tokenA.address,
                        tokenB.address,
                        buyAmount,
                        limitPrice
                    );

                ids = await dex
                    .connect(clientAcc1)
                    .getOrdersByTokens(tokenA.address, tokenB.address);
                expect(ids.length).to.eq(2);
                expect(ids[0]).to.eq(1);
                expect(ids[1]).to.eq(3);

                await dex
                    .connect(clientAcc1)
                    .sellLimit(
                        tokenA.address,
                        tokenB.address,
                        buyAmount,
                        limitPrice
                    );

                ids = await dex
                    .connect(clientAcc1)
                    .getOrdersByTokens(tokenA.address, tokenB.address);
                expect(ids.length).to.eq(3);
                expect(ids[0]).to.eq(1);
                expect(ids[1]).to.eq(3);
                expect(ids[2]).to.eq(4);
            });
        });

        describe("Check that order exists", () => {
            it("Should check that order exists", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                expect(await dex.checkOrderExists(0)).to.eq(false);

                expect(await dex.checkOrderExists(3)).to.eq(false);

                let buyAmount = parseEther("10");
                let limitPrice = parseEther("1.5");

                let mintAmount = parseEther("1000000");
                await tokenA.mint(clientAcc1.address, mintAmount);
                await tokenB.mint(clientAcc1.address, mintAmount);
                await tokenA
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);
                await tokenB
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);

                await dex
                    .connect(clientAcc1)
                    .sellLimit(
                        tokenA.address,
                        tokenB.address,
                        buyAmount,
                        limitPrice
                    );

                expect(await dex.checkOrderExists(3)).to.eq(true);
            });
        });

        describe("Check that two orders matched", () => {
            it("Should check that two orders matched", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                let buyAmount = parseEther("10");
                let limitPrice = parseEther("1.5");
                // 1%
                let slippage = 100;

                let mintAmount = parseEther("1000000");
                await tokenA.mint(clientAcc1.address, mintAmount);
                await tokenB.mint(clientAcc1.address, mintAmount);
                await tokenA
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);
                await tokenB
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);

                await dex
                    .connect(clientAcc1)
                    .sellLimit(
                        tokenA.address,
                        tokenB.address,
                        buyAmount,
                        limitPrice
                    );

                let signatureMarket = await hashAndSignMarket(
                    dex.address,
                    tokenB.address,
                    tokenA.address,
                    buyAmount,
                    slippage,
                    777
                );

                await dex
                    .connect(clientAcc1)
                    .buyMarket(
                        tokenB.address,
                        tokenA.address,
                        buyAmount,
                        slippage,
                        777,
                        signatureMarket
                    );

                expect(await dex.checkMatched(3, 4)).to.eq(false);
                expect(await dex.checkMatched(4, 3)).to.eq(false);

                let signature = await hashAndSignMatch(
                    dex.address,
                    4,
                    [3],
                    777
                );
                await dex.matchOrders(4, [3], 777, signature);

                expect(await dex.checkMatched(3, 4)).to.eq(true);
                expect(await dex.checkMatched(4, 3)).to.eq(true);
            });

            it("Should fail to check matched orders if they don't exist", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                // First of IDs does not exist and reverts
                await expect(
                    dex.checkMatched(3, 4)
                ).to.be.revertedWithCustomError(dex, "OrderDoesNotExist");

                let buyAmount = parseEther("10");
                let limitPrice = parseEther("1.5");
                // 1%
                let slippage = 100;

                let mintAmount = parseEther("1000000");
                await tokenA.mint(clientAcc1.address, mintAmount);
                await tokenB.mint(clientAcc1.address, mintAmount);
                await tokenA
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);
                await tokenB
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);

                await dex
                    .connect(clientAcc1)
                    .sellLimit(
                        tokenA.address,
                        tokenB.address,
                        buyAmount,
                        limitPrice
                    );

                // Now first ID exists and the second does not
                await expect(
                    dex.checkMatched(3, 4)
                ).to.be.revertedWithCustomError(dex, "OrderDoesNotExist");
            });
        });

        describe("Get correct lock amount for order", () => {
            it("Should get correct lock amount for sell orders", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                let buyAmount = parseEther("10");
                let limitPrice = parseEther("1.5");
                let mintAmount = parseEther("1000000");

                await tokenA.mint(clientAcc1.address, mintAmount);
                await tokenB.mint(clientAcc1.address, mintAmount);
                await tokenA
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);
                await tokenB
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);

                let initialClientBalance = await tokenB.balanceOf(
                    clientAcc1.address
                );

                let shouldBeLocked = await dex.getLockAmount(
                    tokenA.address,
                    tokenB.address,
                    buyAmount,
                    limitPrice,
                    1,
                    1
                );
                let shouldBeFee = calcFeeAmount(shouldBeLocked);

                await dex
                    .connect(clientAcc1)
                    .sellLimit(
                        tokenA.address,
                        tokenB.address,
                        buyAmount,
                        limitPrice
                    );

                let endClientBalance = await tokenB.balanceOf(
                    clientAcc1.address
                );

                expect(initialClientBalance.sub(endClientBalance)).to.equal(
                    shouldBeLocked.add(shouldBeFee)
                );
            });

            it("Should get correct lock amount for buy market orders", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                // Create limit order first to initialize a price
                let buyAmount = parseEther("10");
                let slippage = 10;
                let limitPrice = parseEther("1.5");
                let mintAmount = parseEther("1000000");

                await tokenA.mint(clientAcc1.address, mintAmount);
                await tokenB.mint(clientAcc1.address, mintAmount);
                await tokenA
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);
                await tokenB
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);

                await dex.buyLimit(
                    tokenA.address,
                    tokenB.address,
                    buyAmount,
                    limitPrice
                );

                let signatureMarket = await hashAndSignMarket(
                    dex.address,
                    tokenA.address,
                    tokenB.address,
                    buyAmount,
                    slippage,
                    777
                );

                let shouldBeLocked = await dex.getLockAmount(
                    tokenA.address,
                    tokenB.address,
                    buyAmount,
                    0,
                    0,
                    0
                );
                let shouldBeFee = calcFeeAmount(shouldBeLocked);

                let startClientBalance = await tokenB.balanceOf(
                    clientAcc1.address
                );

                await dex
                    .connect(clientAcc1)
                    .buyMarket(
                        tokenA.address,
                        tokenB.address,
                        buyAmount,
                        slippage,
                        777,
                        signatureMarket
                    );

                let endClientBalance = await tokenB.balanceOf(
                    clientAcc1.address
                );

                // Client pays lock amount and fee
                expect(startClientBalance.sub(endClientBalance)).to.eq(
                    shouldBeLocked.add(shouldBeFee)
                );
            });

            describe("Should get correct lock amount for buy limit orders", () => {
                it("Should get correct lock amount if price is not higher than market", async () => {
                    let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                        deploysQuotedB
                    );

                    let buyAmount = parseEther("10");
                    let limitPrice = parseEther("1.5");
                    let mintAmount = parseEther("1000000");

                    await tokenA.mint(clientAcc1.address, mintAmount);
                    await tokenB.mint(clientAcc1.address, mintAmount);
                    await tokenA
                        .connect(clientAcc1)
                        .approve(dex.address, mintAmount);
                    await tokenB
                        .connect(clientAcc1)
                        .approve(dex.address, mintAmount);

                    let shouldBeLocked = await dex.getLockAmount(
                        tokenA.address,
                        tokenB.address,
                        buyAmount,
                        limitPrice,
                        1,
                        0
                    );
                    let shouldBeFee = calcFeeAmount(shouldBeLocked);

                    let startClientBalance = await tokenB.balanceOf(
                        clientAcc1.address
                    );

                    await dex
                        .connect(clientAcc1)
                        .buyLimit(
                            tokenA.address,
                            tokenB.address,
                            buyAmount,
                            limitPrice
                        );

                    let endClientBalance = await tokenB.balanceOf(
                        clientAcc1.address
                    );

                    expect(startClientBalance.sub(endClientBalance)).to.equal(
                        shouldBeLocked.add(shouldBeFee)
                    );
                });

                it("Should get correct lock amount if price is much higher than market", async () => {
                    let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                        deploysQuotedB
                    );

                    let buyAmount = parseEther("10");
                    let limitPrice = parseEther("1.5");
                    let mintAmount = parseEther("1000000");

                    await tokenA.mint(clientAcc1.address, mintAmount);
                    await tokenB.mint(clientAcc1.address, mintAmount);
                    await tokenA
                        .connect(clientAcc1)
                        .approve(dex.address, mintAmount);
                    await tokenB
                        .connect(clientAcc1)
                        .approve(dex.address, mintAmount);

                    let shouldBeLocked = await dex.getLockAmount(
                        tokenA.address,
                        tokenB.address,
                        buyAmount,
                        limitPrice.mul(5),
                        1,
                        0
                    );
                    let shouldBeFee = calcFeeAmount(shouldBeLocked);

                    // Create the first order to initialize pair price
                    await dex
                        .connect(clientAcc1)
                        .buyLimit(
                            tokenA.address,
                            tokenB.address,
                            buyAmount,
                            limitPrice
                        );

                    let startClientBalance = await tokenB.balanceOf(
                        clientAcc1.address
                    );

                    // Create the second order with price higher than market price
                    await dex
                        .connect(clientAcc1)
                        .buyLimit(
                            tokenA.address,
                            tokenB.address,
                            buyAmount,
                            limitPrice.mul(5)
                        );

                    let endClientBalance = await tokenB.balanceOf(
                        clientAcc1.address
                    );

                    expect(startClientBalance.sub(endClientBalance)).to.equal(
                        shouldBeLocked.add(shouldBeFee)
                    );
                });

                it("Should get correct lock amount if oerders not created yet", async () => {
                    let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                        deploysNoQuoted
                    );

                    let buyAmount = parseEther("10");
                    let limitPrice = parseEther("1.5");

                    let expectedLockAmount = buyAmount.mul(limitPrice).div(BigNumber.from("1000000000000000000"));

                    expect(await dex.getLockAmount(
                        tokenA.address,
                        tokenB.address,
                        buyAmount,
                        limitPrice,
                        1,
                        0
                    )).to.be.equal(expectedLockAmount);
                    
                });
            });

            it("Should fail to get correct lock amount", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                await expect(
                    dex.getLockAmount(
                        tokenA.address,
                        tokenB.address,
                        parseEther("1"),
                        parseEther("1"),
                        0,
                        0
                    )
                ).to.be.revertedWithCustomError(dex, "InvalidPrice");

                await expect(
                    dex.getLockAmount(
                        tokenA.address,
                        tokenB.address,
                        parseEther("1"),
                        0,
                        1,
                        0
                    )
                ).to.be.revertedWithCustomError(dex, "InvalidPrice");
            });
        });

        describe("Check that pair exists", () => {
            it("Should check that pair exists", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                let sellAmount = parseEther("10");
                let limitPrice = parseEther("1.5");

                expect(
                    await dex.checkPairExists(tokenA.address, tokenB.address)
                ).to.equal(true);
                expect(
                    await dex.checkPairExists(tokenB.address, tokenA.address)
                ).to.equal(true);
                expect(
                    await dex.checkPairExists(zeroAddress, zeroAddress)
                ).to.equal(false);
            });
        });

        describe("Get pair price", () => {
            it("Should get the price of the pair", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                let buyAmount = parseEther("10");
                let limitPrice = parseEther("1.5");
                let mintAmount = parseEther("1000000");

                await tokenA.mint(clientAcc1.address, mintAmount);
                await tokenB.mint(clientAcc1.address, mintAmount);
                await tokenA
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);
                await tokenB
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);

                await dex
                    .connect(clientAcc1)
                    .buyLimit(
                        tokenA.address,
                        tokenB.address,
                        buyAmount,
                        limitPrice
                    );

                let [, pairPrice] = await dex.getPrice(
                    tokenA.address,
                    tokenB.address
                );
                expect(pairPrice).to.eq(limitPrice);
            });
            it("Should fail to get the price of the pair", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                await expect(
                    dex.getPrice(adminToken.address, zeroAddress)
                ).to.be.revertedWithCustomError(dex, "NoQuotedTokens");
            });
        });
    });

    // #MO
    describe("Market orders", () => {
        // #MBO
        describe("Buy orders", () => {
            it("Should create market buy orders", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                // Create limit order first to initialize a price
                let buyAmount = parseEther("10");
                let slippage = 10;
                let limitPrice = parseEther("1.5");
                let mintAmount = parseEther("1000000");

                await tokenA.mint(clientAcc1.address, mintAmount);
                await tokenB.mint(clientAcc1.address, mintAmount);
                await tokenA
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);
                await tokenB
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);

                let signatureMarket = await hashAndSignMarket(
                    dex.address,
                    tokenA.address,
                    tokenB.address,
                    buyAmount,
                    slippage,
                    777
                );

                let startClientBalance = await tokenB.balanceOf(
                    clientAcc1.address
                );
                let startDexBalance = await tokenB.balanceOf(dex.address);

                await expect(
                    dex
                        .connect(clientAcc1)
                        .buyMarket(
                            tokenA.address,
                            tokenB.address,
                            buyAmount,
                            slippage,
                            777,
                            signatureMarket
                        )
                )
                    .to.emit(dex, "OrderCreated")
                    .withArgs(
                        3,
                        clientAcc1.address,
                        tokenA.address,
                        tokenB.address,
                        buyAmount,
                        0,
                        0,
                        0,
                        false
                    );

                let endClientBalance = await tokenB.balanceOf(
                    clientAcc1.address
                );
                let endDexBalance = await tokenB.balanceOf(dex.address);

                // Use limit price of last limit order
                let shouldBeLocked = calcBuyerLockAmount(
                    buyAmount,
                    limitPrice,
                    true
                );
                let shouldBeFee = calcFeeAmount(shouldBeLocked);

                // Client pays lock amount and fee
                expect(startClientBalance.sub(endClientBalance)).to.eq(
                    shouldBeLocked.add(shouldBeFee)
                );
                expect(endDexBalance.sub(startDexBalance)).to.eq(
                    shouldBeLocked.add(shouldBeFee)
                );

                // Check that order was really created
                let order = await dex.getOrder(3);

                let user = order[0];
                let firstToken = order[1];
                let secondToken = order[2];
                let amount = order[3];
                let amountFilled = order[4];
                let type = order[5];
                let side = order[6];
                let price = order[7];
                let isCancellable = order[8];
                let feeAmount = order[9];
                let lockedAmount = order[10];
                let status = order[11];

                expect(user).to.eq(clientAcc1.address);
                expect(firstToken).to.eq(tokenA.address);
                expect(secondToken).to.eq(tokenB.address);
                expect(amount).to.eq(buyAmount);
                expect(amountFilled).to.eq(0);
                expect(type).to.eq(0);
                expect(side).to.eq(0);
                expect(price).to.eq(0);
                expect(isCancellable).to.eq(false);
                expect(feeAmount).to.eq(shouldBeFee);
                expect(lockedAmount).to.eq(shouldBeLocked);
                expect(status).to.eq(0);
            });

            it("Should fail to create market buy orders with invalid signature", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                // Create limit order first to initialize a price
                let buyAmount = parseEther("10");
                let slippage = 10;
                let limitPrice = parseEther("1.5");
                let mintAmount = parseEther("1000000");

                await tokenA.mint(clientAcc1.address, mintAmount);
                await tokenB.mint(clientAcc1.address, mintAmount);
                await tokenA
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);
                await tokenB
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);

                let signatureMarket = await hashAndSignMarket(
                    dex.address,
                    tokenA.address,
                    tokenB.address,
                    buyAmount,
                    slippage,
                    777
                );

                // Different nonce from the signature
                await expect(
                    dex
                        .connect(clientAcc1)
                        .buyMarket(
                            tokenA.address,
                            tokenB.address,
                            buyAmount,
                            slippage,
                            666,
                            signatureMarket
                        )
                ).to.be.revertedWithCustomError(dex, "InvalidSignature");

                // Normal execution
                await dex
                    .connect(clientAcc1)
                    .buyMarket(
                        tokenA.address,
                        tokenB.address,
                        buyAmount,
                        slippage,
                        777,
                        signatureMarket
                    );

                // Same nonce twice
                await expect(
                    dex
                        .connect(clientAcc1)
                        .buyMarket(
                            tokenA.address,
                            tokenB.address,
                            buyAmount,
                            slippage,
                            777,
                            signatureMarket
                        )
                ).to.be.revertedWithCustomError(dex, "TxAlreadyExecuted");
            });
        });

        // #MSO
        describe("Sell orders", () => {
            it("Should create market sell orders", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                // Create limit order first to initialize a price
                let sellAmount = parseEther("10");
                let slippage = 10;
                let limitPrice = parseEther("1.5");
                let mintAmount = parseEther("1000000");

                await tokenA.mint(clientAcc1.address, mintAmount);
                await tokenB.mint(clientAcc1.address, mintAmount);
                await tokenA
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);
                await tokenB
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);

                let signatureMarket = await hashAndSignMarket(
                    dex.address,
                    tokenA.address,
                    tokenB.address,
                    sellAmount,
                    slippage,
                    777
                );

                let startClientBalance = await tokenB.balanceOf(
                    clientAcc1.address
                );
                let startDexBalance = await tokenB.balanceOf(dex.address);

                await expect(
                    dex
                        .connect(clientAcc1)
                        .sellMarket(
                            tokenA.address,
                            tokenB.address,
                            sellAmount,
                            slippage,
                            777,
                            signatureMarket
                        )
                )
                    .to.emit(dex, "OrderCreated")
                    .withArgs(
                        3,
                        clientAcc1.address,
                        tokenA.address,
                        tokenB.address,
                        sellAmount,
                        0,
                        1,
                        0,
                        false
                    );

                let endClientBalance = await tokenB.balanceOf(
                    clientAcc1.address
                );
                let endDexBalance = await tokenB.balanceOf(dex.address);

                // Use price of the last limit order
                let shouldBeLocked = sellAmount;
                let shouldBeFee = calcFeeAmount(shouldBeLocked);

                // Client pays lock amount and fee
                expect(startClientBalance.sub(endClientBalance)).to.eq(
                    shouldBeLocked.add(shouldBeFee)
                );
                expect(endDexBalance.sub(startDexBalance)).to.eq(
                    shouldBeLocked.add(shouldBeFee)
                );

                // Check that order was really created
                let order = await dex.getOrder(3);

                let user = order[0];
                let firstToken = order[1];
                let secondToken = order[2];
                let amount = order[3];
                let amountFilled = order[4];
                let type = order[5];
                let side = order[6];
                let price = order[7];
                let isCancellable = order[8];
                let feeAmount = order[9];
                let lockedAmount = order[10];
                let status = order[11];

                expect(user).to.eq(clientAcc1.address);
                expect(firstToken).to.eq(tokenA.address);
                expect(secondToken).to.eq(tokenB.address);
                expect(amount).to.eq(sellAmount);
                expect(amountFilled).to.eq(0);
                expect(type).to.eq(0);
                expect(side).to.eq(1);
                expect(price).to.eq(0);
                expect(isCancellable).to.eq(false);
                expect(feeAmount).to.eq(shouldBeFee);
                expect(lockedAmount).to.eq(shouldBeLocked);
                expect(status).to.eq(0);
            });

            it("Should fail to create market sell orders with invalid signature", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                // Create limit order first to initialize a price
                let sellAmount = parseEther("10");
                let slippage = 10;
                let limitPrice = parseEther("1.5");
                let mintAmount = parseEther("1000000");

                await tokenA.mint(clientAcc1.address, mintAmount);
                await tokenB.mint(clientAcc1.address, mintAmount);
                await tokenA
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);
                await tokenB
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);

                let signatureMarket = await hashAndSignMarket(
                    dex.address,
                    tokenA.address,
                    tokenB.address,
                    sellAmount,
                    slippage,
                    777
                );

                // Different nonce from the signature
                await expect(
                    dex
                        .connect(clientAcc1)
                        .sellMarket(
                            tokenA.address,
                            tokenB.address,
                            sellAmount,
                            slippage,
                            666,
                            signatureMarket
                        )
                ).to.be.revertedWithCustomError(dex, "InvalidSignature");

                // Normal execution
                await dex
                    .connect(clientAcc1)
                    .sellMarket(
                        tokenA.address,
                        tokenB.address,
                        sellAmount,
                        slippage,
                        777,
                        signatureMarket
                    );

                // Same nonce twice
                await expect(
                    dex
                        .connect(clientAcc1)
                        .sellMarket(
                            tokenA.address,
                            tokenB.address,
                            sellAmount,
                            slippage,
                            777,
                            signatureMarket
                        )
                ).to.be.revertedWithCustomError(dex, "TxAlreadyExecuted");
            });
        });
    });

    // #LO
    describe("Limit orders", () => {
        // #LBO
        describe("Buy orders", () => {
            it("Should create limit buy orders", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                let buyAmount = parseEther("10");
                let limitPrice = parseEther("1.5");
                let mintAmount = parseEther("1000000");

                await tokenA.mint(clientAcc1.address, mintAmount);
                await tokenB.mint(clientAcc1.address, mintAmount);
                await tokenA
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);
                await tokenB
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);

                let startClientBalance = await tokenB.balanceOf(
                    clientAcc1.address
                );
                let startDexBalance = await tokenB.balanceOf(dex.address);

                await expect(
                    dex
                        .connect(clientAcc1)
                        .buyLimit(
                            tokenA.address,
                            tokenB.address,
                            buyAmount,
                            limitPrice
                        )
                )
                    .to.emit(dex, "OrderCreated")
                    .withArgs(
                        3,
                        clientAcc1.address,
                        tokenA.address,
                        tokenB.address,
                        buyAmount,
                        1,
                        0,
                        limitPrice,
                        true
                    );

                let endClientBalance = await tokenB.balanceOf(
                    clientAcc1.address
                );
                let endDexBalance = await tokenB.balanceOf(dex.address);

                // Pair price should have udpated
                let [quotedToken, pairPrice] = await dex.getPrice(
                    tokenA.address,
                    tokenB.address
                );
                expect(pairPrice).to.eq(limitPrice);

                let shouldBeLocked = calcBuyerLockAmount(
                    buyAmount,
                    limitPrice,
                    true
                );
                let shouldBeFee = calcFeeAmount(shouldBeLocked);

                // Client pays lock amount and fee
                expect(startClientBalance.sub(endClientBalance)).to.eq(
                    shouldBeLocked.add(shouldBeFee)
                );
                expect(endDexBalance.sub(startDexBalance)).to.eq(
                    shouldBeLocked.add(shouldBeFee)
                );

                // Check that order was really created
                let order = await dex.getOrder(3);

                let user = order[0];
                let firstToken = order[1];
                let secondToken = order[2];
                let amount = order[3];
                let amountFilled = order[4];
                let type = order[5];
                let side = order[6];
                let price = order[7];
                let isCancellable = order[8];
                let feeAmount = order[9];
                let lockedAmount = order[10];
                let status = order[11];

                expect(user).to.eq(clientAcc1.address);
                expect(firstToken).to.eq(tokenA.address);
                expect(secondToken).to.eq(tokenB.address);
                expect(amount).to.eq(buyAmount);
                expect(amountFilled).to.eq(0);
                expect(type).to.eq(1);
                expect(side).to.eq(0);
                expect(price).to.eq(limitPrice);
                expect(isCancellable).to.eq(true);
                expect(feeAmount).to.eq(shouldBeFee);
                expect(lockedAmount).to.eq(shouldBeLocked);
                expect(status).to.eq(0);
            });

            it("Should lock according to market price if limit price is much higher", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                let buyAmount = parseEther("10");
                let limitPrice = parseEther("1.5");
                let mintAmount = parseEther("1000000");

                await tokenA.mint(clientAcc1.address, mintAmount);
                await tokenB.mint(clientAcc1.address, mintAmount);
                await tokenA
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);
                await tokenB
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);

                let startClientBalance1 = await tokenB.balanceOf(
                    clientAcc1.address
                );

                // Create the first order to initialize pair price
                await dex
                    .connect(clientAcc1)
                    .buyLimit(
                        tokenA.address,
                        tokenB.address,
                        buyAmount,
                        limitPrice
                    );

                let endClientBalance1 = await tokenB.balanceOf(
                    clientAcc1.address
                );
                // This lock amount is based on limit price of the order
                let firstLockAmount =
                    startClientBalance1.sub(endClientBalance1);

                let startClientBalance2 = await tokenB.balanceOf(
                    clientAcc1.address
                );

                // Create the second order with price higher than market price
                await dex
                    .connect(clientAcc1)
                    .buyLimit(
                        tokenA.address,
                        tokenB.address,
                        buyAmount,
                        limitPrice.mul(5)
                    );

                let endClientBalance2 = await tokenB.balanceOf(
                    clientAcc1.address
                );
                // This lock amount is based on market price
                // Market price is equal to the previous order limit price
                // That's why lock amounts should be equal
                let secondLockAmount =
                    startClientBalance2.sub(endClientBalance2);

                expect(firstLockAmount).to.eq(secondLockAmount);

                let shouldBeLocked = calcBuyerLockAmount(
                    buyAmount,
                    limitPrice,
                    true
                );
                let shouldBeFee = calcFeeAmount(shouldBeLocked);

                expect(startClientBalance1.sub(endClientBalance1)).to.eq(
                    shouldBeLocked.add(shouldBeFee)
                );

                // Check that order was really created
                let order = await dex.getOrder(3);

                let user = order[0];
                let firstToken = order[1];
                let secondToken = order[2];
                let amount = order[3];
                let amountFilled = order[4];
                let type = order[5];
                let side = order[6];
                let price = order[7];
                let isCancellable = order[8];
                let feeAmount = order[9];
                let lockedAmount = order[10];
                let status = order[11];

                expect(user).to.eq(clientAcc1.address);
                expect(firstToken).to.eq(tokenA.address);
                expect(secondToken).to.eq(tokenB.address);
                expect(amount).to.eq(buyAmount);
                expect(amountFilled).to.eq(0);
                expect(type).to.eq(1);
                expect(side).to.eq(0);
                expect(price).to.eq(limitPrice);
                expect(isCancellable).to.eq(true);
                expect(feeAmount).to.eq(shouldBeFee);
                expect(lockedAmount).to.eq(shouldBeLocked);
                expect(status).to.eq(0);
            });

            // Test for _prepareOrder internal function
            it("Should fail to create limit order with invalid parameters", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                let limitPrice = parseEther("1.5");
                let mintAmount = parseEther("1000000");

                await tokenA.mint(clientAcc1.address, mintAmount);
                await tokenB.mint(clientAcc1.address, mintAmount);
                await tokenA
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);
                await tokenB
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);

                await expect(
                    dex
                        .connect(clientAcc1)
                        .buyLimit(tokenA.address, tokenB.address, 0, limitPrice)
                ).to.be.revertedWithCustomError(dex, "ZeroAmount");
            });
        });

        // #LSO
        describe("Sell orders", () => {
            it("Should create limit sell orders", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                let sellAmount = parseEther("10");
                let limitPrice = parseEther("1.5");
                let mintAmount = parseEther("1000000");

                await tokenA.mint(clientAcc1.address, mintAmount);
                await tokenB.mint(clientAcc1.address, mintAmount);
                await tokenA
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);
                await tokenB
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);

                let startClientBalance = await tokenB.balanceOf(
                    clientAcc1.address
                );
                let startDexBalance = await tokenB.balanceOf(dex.address);

                await expect(
                    dex
                        .connect(clientAcc1)
                        .sellLimit(
                            tokenA.address,
                            tokenB.address,
                            sellAmount,
                            limitPrice
                        )
                )
                    .to.emit(dex, "OrderCreated")
                    .withArgs(
                        3,
                        clientAcc1.address,
                        tokenA.address,
                        tokenB.address,
                        sellAmount,
                        1,
                        1,
                        limitPrice,
                        true
                    );

                let endClientBalance = await tokenB.balanceOf(
                    clientAcc1.address
                );
                let endDexBalance = await tokenB.balanceOf(dex.address);

                // Pair price should have udpated
                let [quotedToken, pairPrice] = await dex.getPrice(
                    tokenA.address,
                    tokenB.address
                );
                expect(pairPrice).to.eq(limitPrice);

                let shouldBeLocked = sellAmount;
                let shouldBeFee = calcFeeAmount(shouldBeLocked);

                // Client pays lock amount and fee
                expect(startClientBalance.sub(endClientBalance)).to.eq(
                    shouldBeLocked.add(shouldBeFee)
                );
                expect(endDexBalance.sub(startDexBalance)).to.eq(
                    shouldBeLocked.add(shouldBeFee)
                );

                // Check that order was really created
                let order = await dex.getOrder(3);

                let user = order[0];
                let firstToken = order[1];
                let secondToken = order[2];
                let amount = order[3];
                let amountFilled = order[4];
                let type = order[5];
                let side = order[6];
                let price = order[7];
                let isCancellable = order[8];
                let feeAmount = order[9];
                let lockedAmount = order[10];
                let status = order[11];

                expect(user).to.eq(clientAcc1.address);
                expect(firstToken).to.eq(tokenA.address);
                expect(secondToken).to.eq(tokenB.address);
                expect(amount).to.eq(sellAmount);
                expect(amountFilled).to.eq(0);
                expect(type).to.eq(1);
                expect(side).to.eq(1);
                expect(price).to.eq(limitPrice);
                expect(isCancellable).to.eq(true);
                expect(feeAmount).to.eq(shouldBeFee);
                expect(lockedAmount).to.eq(shouldBeLocked);
                expect(status).to.eq(0);
            });
        });
    });

    // #CO
    describe("Cancel orders", () => {
        // NOTICE: Cancelling of order of any type works the same way
        // so only cancelling of limit buy orders is checked for simplicity
        it("Should cancel freshly created order", async () => {
            let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                deploysQuotedB
            );

            let buyAmount = parseEther("10");
            let limitPrice = parseEther("1.5");
            let mintAmount = parseEther("1000000");

            await tokenA.mint(clientAcc1.address, mintAmount);
            await tokenB.mint(clientAcc1.address, mintAmount);
            await tokenA.connect(clientAcc1).approve(dex.address, mintAmount);
            await tokenB.connect(clientAcc1).approve(dex.address, mintAmount);

            let shouldBeLocked = calcBuyerLockAmount(
                buyAmount,
                limitPrice,
                true
            );
            let shouldBeFee = calcFeeAmount(shouldBeLocked);

            await dex
                .connect(clientAcc1)
                .buyLimit(
                    tokenA.address,
                    tokenB.address,
                    buyAmount,
                    limitPrice
                );

            let startDexBalance = await tokenB.balanceOf(dex.address);

            let order = await dex.getOrder(3);
            let status = order[11];
            expect(status).to.eq(0);

            await expect(dex.connect(clientAcc1).cancelOrder(3))
                .to.emit(dex, "OrderCancelled")
                .withArgs(3);

            let endDexBalance = await tokenB.balanceOf(dex.address);

            // Whole lock and fee should be returned to the user
            expect(startDexBalance.sub(endDexBalance)).to.eq(
                shouldBeLocked.add(shouldBeFee)
            );

            // Order status should change
            order = await dex.getOrder(3);
            status = order[11];
            expect(status).to.eq(3);
        });

        it("Should cancel partially executed order", async () => {
            let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                deploysQuotedB
            );

            let sellAmount = parseEther("10");
            // Make buy amount 4 times less
            // This should make ID3 partially executed
            let buyAmount = sellAmount.div(4);
            let limitPrice = parseEther("1.5");
            let nonce = 777;

            let mintAmount = parseEther("1000000");
            await tokenA.mint(clientAcc1.address, mintAmount);
            await tokenB.mint(clientAcc1.address, mintAmount);
            await tokenA.connect(clientAcc1).approve(dex.address, mintAmount);
            await tokenB.connect(clientAcc1).approve(dex.address, mintAmount);

            let sellerShouldBeLocked = sellAmount;
            let sellerShouldBeSpent = sellAmount.div(4);

            let sellerShouldBeFee = calcFeeAmount(sellerShouldBeLocked);

            let buyerShouldBeLocked = calcBuyerLockAmount(
                buyAmount,
                limitPrice,
                false
            );
            let buyerShouldBeSpent = calcBuyerSpentAmount(
                buyAmount,
                sellAmount,
                limitPrice,
                false,
                false,
                true
            );
            let buyerShouldBeFee = calcFeeAmount(buyerShouldBeLocked);

            await dex
                .connect(clientAcc1)
                .sellLimit(
                    tokenA.address,
                    tokenB.address,
                    sellAmount,
                    limitPrice
                );

            await dex
                .connect(clientAcc1)
                .buyLimit(
                    tokenB.address,
                    tokenA.address,
                    buyAmount,
                    limitPrice
                );

            let signature = await hashAndSignMatch(dex.address, 4, [3], nonce);
            await dex.matchOrders(4, [3], nonce, signature);

            // Check that order is partially closed
            let order = await dex.getOrder(3);
            let status = order[11];
            expect(status).to.eq(1);

            let startDexBalance = await tokenB.balanceOf(dex.address);

            // Cancel partially executed order
            await dex.connect(clientAcc1).cancelOrder(3);

            let endDexBalance = await tokenB.balanceOf(dex.address);

            // 1/4 of ID3 was executed, so full lock and 3/4 of fee
            // should be returned
            expect(startDexBalance.sub(endDexBalance)).to.eq(
                sellerShouldBeLocked
                    .sub(sellerShouldBeSpent)
                    .add(sellerShouldBeFee.mul(3).div(4))
            );

            // Check that order is cancelled
            order = await dex.getOrder(3);
            let user = order[0];
            let firstToken = order[1];
            let secondToken = order[2];
            let amount = order[3];
            let amountFilled = order[4];
            let type = order[5];
            let side = order[6];
            let price = order[7];
            let isCancellable = order[8];
            let feeAmount = order[9];
            let lockedAmount = order[10];
            status = order[11];

            expect(user).to.eq(clientAcc1.address);
            expect(firstToken).to.eq(tokenA.address);
            expect(secondToken).to.eq(tokenB.address);
            expect(amount).to.eq(sellAmount);
            // 1/4 of sell order should be filled
            expect(amountFilled).to.eq(sellAmount.mul(1).div(4));
            expect(type).to.eq(1);
            expect(side).to.eq(1);
            expect(price).to.eq(limitPrice);
            expect(isCancellable).to.eq(true);
            // 1/4 of fee should be left
            expect(feeAmount).to.eq(sellerShouldBeFee.mul(1).div(4));
            // Full lock should be returned
            expect(lockedAmount).to.eq(0);
            expect(status).to.eq(3);
        });

        it("Should fail to cancel order", async () => {
            let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                deploysQuotedB
            );

            let buyAmount = parseEther("10");
            let limitPrice = parseEther("1.5");
            let mintAmount = parseEther("1000000");

            await tokenA.mint(clientAcc1.address, mintAmount);
            await tokenB.mint(clientAcc1.address, mintAmount);
            await tokenA.connect(clientAcc1).approve(dex.address, mintAmount);
            await tokenB.connect(clientAcc1).approve(dex.address, mintAmount);

            // Create a non-cancellable order
            // ID3
            await dex
                .connect(ownerAcc)
                .startSaleSingle(
                    tokenA.address,
                    tokenB.address,
                    buyAmount,
                    limitPrice
                );

            await expect(
                dex.connect(clientAcc1).cancelOrder(3)
            ).to.be.revertedWithCustomError(dex, "NonCancellable");

            // Create the second order, cancel it and try to cancel again
            // ID4
            await dex
                .connect(clientAcc1)
                .buyLimit(
                    tokenA.address,
                    tokenB.address,
                    buyAmount,
                    limitPrice
                );

            await dex.connect(clientAcc1).cancelOrder(4);

            await expect(
                dex.connect(clientAcc1).cancelOrder(4)
            ).to.be.revertedWithCustomError(dex, "InvalidOrderStatus");

            // Create the third order and try to cancel it from another account
            // ID5
            await dex
                .connect(clientAcc1)
                .buyLimit(
                    tokenA.address,
                    tokenB.address,
                    buyAmount,
                    limitPrice
                );

            await expect(
                dex.connect(ownerAcc).cancelOrder(5)
            ).to.be.revertedWithCustomError(dex, "NotOrderCreator");

            // Try to cancel unexisting order
            await expect(
                dex.connect(ownerAcc).cancelOrder(9)
            ).to.be.revertedWithCustomError(dex, "OrderDoesNotExist");
        });
    });

    // #S
    describe("Sale", () => {
        // #SS
        describe("Single sale", () => {
            it("Should start a single sale by first token admin", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                let sellAmount = parseEther("10");
                let limitPrice = parseEther("1.5");
                let mintAmount = parseEther("1000000");
                let expectedOrderId = 3;

                expect(await dex.checkOrderExists(expectedOrderId)).to.be.false;

                let startOwnerBalance = await tokenB.balanceOf(
                    ownerAcc.address
                );
                let startDexBalance = await tokenB.balanceOf(dex.address);

                await expect(
                    dex
                        .connect(ownerAcc)
                        .startSaleSingle(
                            tokenA.address,
                            tokenB.address,
                            sellAmount,
                            limitPrice
                        )
                )
                    .to.emit(dex, "SaleStarted")
                    .withArgs(
                        expectedOrderId,
                        tokenA.address,
                        tokenB.address,
                        sellAmount,
                        limitPrice
                    );

                let endOwnerBalance = await tokenB.balanceOf(ownerAcc.address);

                let endDexBalance = await tokenB.balanceOf(dex.address);

                let shouldBeLocked = sellAmount;
                let shouldBeFee = calcFeeAmount(shouldBeLocked);

                // Client pays lock amount and fee
                expect(startOwnerBalance.sub(endOwnerBalance)).to.eq(
                    shouldBeLocked.add(shouldBeFee)
                );
                expect(endDexBalance.sub(startDexBalance)).to.eq(
                    shouldBeLocked.add(shouldBeFee)
                );

                // Check that order was really created
                let order = await dex.getOrder(expectedOrderId);

                let user = order[0];
                let firstToken = order[1];
                let secondToken = order[2];
                let amount = order[3];
                let amountFilled = order[4];
                let type = order[5];
                let side = order[6];
                let price = order[7];
                let isCancellable = order[8];
                let feeAmount = order[9];
                let lockedAmount = order[10];
                let status = order[11];

                expect(user).to.eq(ownerAcc.address);
                expect(firstToken).to.eq(tokenA.address);
                expect(secondToken).to.eq(tokenB.address);
                expect(amount).to.eq(sellAmount);
                expect(amountFilled).to.eq(0);
                expect(type).to.eq(1);
                expect(side).to.eq(1);
                expect(price).to.eq(limitPrice);
                expect(isCancellable).to.eq(false);
                expect(feeAmount).to.eq(shouldBeFee);
                expect(lockedAmount).to.eq(shouldBeLocked);
                expect(status).to.eq(0);
            });

            it("Should start a single sale by second token admin", async () => {
                let { dex, adminToken, tokenA, tokenB, tokenD } = await loadFixture(
                    deploysNoQuoted
                );

                let sellAmount = parseEther("10");
                let limitPrice = parseEther("1.5");
                let expectedOrderId = 1;

                await expect(
                    dex
                        .connect(clientAcc2)
                        .startSaleSingle(
                            tokenA.address,
                            tokenD.address,
                            sellAmount,
                            limitPrice
                        )
                )
                    .to.emit(dex, "SaleStarted")
                    .withArgs(
                        expectedOrderId,
                        tokenA.address,
                        tokenD.address,
                        sellAmount,
                        limitPrice
                    );
            });

            it("Should start a single sale(two uncontrolled tokens)", async () => {
                let { dex } = await loadFixture(
                    deploysNoQuoted
                );

                const tokenTx = await ethers.getContractFactory("ERC20Mintable");
                const token1 = await tokenTx.deploy("Token 1", "T1");
                await token1.deployed();
                const token2 = await tokenTx.deploy("Token 2", "T2");
                await token2.deployed();

                let mintAmount = parseEther("1000000");
                await token1.mint(ownerAcc.address, mintAmount);
                await token1.approve(dex.address, mintAmount);
                await token2.mint(ownerAcc.address, mintAmount);
                await token2.approve(dex.address, mintAmount);

                let sellAmount = parseEther("10");
                let limitPrice = parseEther("1.5");
                let expectedOrderId = 1;

                await expect(
                    dex
                        .connect(ownerAcc)
                        .startSaleSingle(
                            token1.address,
                            token2.address,
                            sellAmount,
                            limitPrice
                        )
                )
                    .to.emit(dex, "SaleStarted")
                    .withArgs(
                        expectedOrderId,
                        token1.address,
                        token2.address,
                        sellAmount,
                        limitPrice
                    );
            });

            describe("Reverts", () => {
                let params;
                beforeEach(async () => {
                    params = await loadFixture(
                        deploysNoQuoted
                    );
                });

                it("Should fail to start a single sale of native token", async () => {
                    let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                        deploysQuotedB
                    );
    
                    let sellAmount = parseEther("10");
                    let limitPrice = parseEther("1.5");
    
                    await expect(
                        dex
                            .connect(ownerAcc)
                            .startSaleSingle(
                                zeroAddress,
                                tokenB.address,
                                sellAmount,
                                limitPrice
                            )
                    ).to.be.revertedWithCustomError(
                        dex,
                        "InvalidFirstTokenAddress"
                    );
                });

                it("Should revert if admin token NOT set", async () => {
                    let sellAmount = parseEther("10");
                    let limitPrice = parseEther("1.5");

                    let dexTx2 = await ethers.getContractFactory("BentureDex");
                    let dex2 = await dexTx2.deploy();
                    await dex2.deployed();
                    
                    await expect(
                        dex2
                            .connect(clientAcc1)
                            .startSaleSingle(
                                params.tokenA.address,
                                params.tokenB.address,
                                sellAmount,
                                limitPrice
                            )
                    )
                        .to.be.revertedWithCustomError(params.dex, "AdminTokenNotSet");
                });

                it("Should revert if user NOT admin of any", async () => {
                    let sellAmount = parseEther("10");
                    let limitPrice = parseEther("1.5");

                    await expect(
                        params.dex
                            .connect(clientAcc1)
                            .startSaleSingle(
                                params.tokenA.address,
                                params.tokenB.address,
                                sellAmount,
                                limitPrice
                            )
                    )
                        .to.be.revertedWithCustomError(params.dex, "NotAdmin");
                });

                it("Should revert if user NOT admin of tokenA or TokenB", async () => {
                    let sellAmount = parseEther("10");
                    let limitPrice = parseEther("1.5");

                    await expect(
                        params.dex
                            .connect(clientAcc2)
                            .startSaleSingle(
                                params.tokenA.address,
                                params.tokenB.address,
                                sellAmount,
                                limitPrice
                            )
                    )
                        .to.be.revertedWithCustomError(params.dex, "NotAdmin");
                });
            });
        });

        // #SM
        describe("Multiple sale", () => {
            it("Should start multiple sale", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                let sellAmount1 = parseEther("5");
                let sellAmount2 = parseEther("5");
                let sellAmount3 = parseEther("8");
                let sellAmount4 = parseEther("8");

                let limitPrice1 = parseEther("1.5");
                let limitPrice2 = parseEther("1.5");
                let limitPrice3 = parseEther("4");
                let limitPrice4 = parseEther("4");

                let startOwnerBalance = await tokenB.balanceOf(
                    ownerAcc.address
                );
                let startDexBalance = await tokenB.balanceOf(dex.address);

                // ID3
                await dex
                    .connect(ownerAcc)
                    .startSaleMultiple(
                        tokenA.address,
                        tokenB.address,
                        [sellAmount1, sellAmount2, sellAmount3, sellAmount4],
                        [limitPrice1, limitPrice2, limitPrice3, limitPrice4]
                    );

                let endOwnerBalance = await tokenB.balanceOf(ownerAcc.address);

                let endDexBalance = await tokenB.balanceOf(dex.address);

                let shouldBeLocked1 = sellAmount1;
                let shouldBeLocked2 = sellAmount2;
                let shouldBeLocked3 = sellAmount3;
                let shouldBeLocked4 = sellAmount4;

                let shouldBeFee1 = calcFeeAmount(shouldBeLocked1);
                let shouldBeFee2 = calcFeeAmount(shouldBeLocked2);
                let shouldBeFee3 = calcFeeAmount(shouldBeLocked3);
                let shouldBeFee4 = calcFeeAmount(shouldBeLocked4);

                let shouldBeLockedTotal = sellAmount1
                    .add(sellAmount2)
                    .add(sellAmount3)
                    .add(sellAmount4);
                let shouldBeFeeTotal = calcFeeAmount(shouldBeLockedTotal);

                expect(startOwnerBalance.sub(endOwnerBalance)).to.eq(
                    shouldBeLockedTotal.add(shouldBeFeeTotal)
                );
                expect(endDexBalance.sub(startDexBalance)).to.eq(
                    shouldBeLockedTotal.add(shouldBeFeeTotal)
                );

                let order1 = await dex.getOrder(3);
                let order2 = await dex.getOrder(4);
                let order3 = await dex.getOrder(5);
                let order4 = await dex.getOrder(6);

                let user = order1[0];
                let firstToken = order1[1];
                let secondToken = order1[2];
                let amount = order1[3];
                let amountFilled = order1[4];
                let type = order1[5];
                let side = order1[6];
                let price = order1[7];
                let isCancellable = order1[8];
                let feeAmount = order1[9];
                let lockedAmount = order1[10];
                let status = order1[11];

                expect(user).to.eq(ownerAcc.address);
                expect(firstToken).to.eq(tokenA.address);
                expect(secondToken).to.eq(tokenB.address);
                expect(amount).to.eq(sellAmount1);
                expect(amountFilled).to.eq(0);
                expect(type).to.eq(1);
                expect(side).to.eq(1);
                expect(price).to.eq(limitPrice1);
                expect(isCancellable).to.eq(false);
                expect(feeAmount).to.eq(shouldBeFee1);
                expect(lockedAmount).to.eq(shouldBeLocked1);
                expect(status).to.eq(0);

                user = order2[0];
                firstToken = order2[1];
                secondToken = order2[2];
                amount = order2[3];
                amountFilled = order2[4];
                type = order2[5];
                side = order2[6];
                price = order2[7];
                isCancellable = order2[8];
                feeAmount = order2[9];
                lockedAmount = order2[10];
                status = order2[11];

                expect(user).to.eq(ownerAcc.address);
                expect(firstToken).to.eq(tokenA.address);
                expect(secondToken).to.eq(tokenB.address);
                expect(amount).to.eq(sellAmount2);
                expect(amountFilled).to.eq(0);
                expect(type).to.eq(1);
                expect(side).to.eq(1);
                expect(price).to.eq(limitPrice2);
                expect(isCancellable).to.eq(false);
                expect(feeAmount).to.eq(shouldBeFee2);
                expect(lockedAmount).to.eq(shouldBeLocked2);
                expect(status).to.eq(0);

                user = order3[0];
                firstToken = order3[1];
                secondToken = order3[2];
                amount = order3[3];
                amountFilled = order3[4];
                type = order3[5];
                side = order3[6];
                price = order3[7];
                isCancellable = order3[8];
                feeAmount = order3[9];
                lockedAmount = order3[10];
                status = order3[11];

                expect(user).to.eq(ownerAcc.address);
                expect(firstToken).to.eq(tokenA.address);
                expect(secondToken).to.eq(tokenB.address);
                expect(amount).to.eq(sellAmount3);
                expect(amountFilled).to.eq(0);
                expect(type).to.eq(1);
                expect(side).to.eq(1);
                expect(price).to.eq(limitPrice3);
                expect(isCancellable).to.eq(false);
                expect(feeAmount).to.eq(shouldBeFee3);
                expect(lockedAmount).to.eq(shouldBeLocked3);
                expect(status).to.eq(0);

                user = order4[0];
                firstToken = order4[1];
                secondToken = order4[2];
                amount = order4[3];
                amountFilled = order4[4];
                type = order4[5];
                side = order4[6];
                price = order4[7];
                isCancellable = order4[8];
                feeAmount = order4[9];
                lockedAmount = order4[10];
                status = order4[11];

                expect(user).to.eq(ownerAcc.address);
                expect(firstToken).to.eq(tokenA.address);
                expect(secondToken).to.eq(tokenB.address);
                expect(amount).to.eq(sellAmount4);
                expect(amountFilled).to.eq(0);
                expect(type).to.eq(1);
                expect(side).to.eq(1);
                expect(price).to.eq(limitPrice4);
                expect(isCancellable).to.eq(false);
                expect(feeAmount).to.eq(shouldBeFee4);
                expect(lockedAmount).to.eq(shouldBeLocked4);
                expect(status).to.eq(0);
            });

            it("Should fail to start multiple sale with different arrays", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                let sellAmount1 = parseEther("5");
                let sellAmount2 = parseEther("5");
                let sellAmount3 = parseEther("8");
                let sellAmount4 = parseEther("8");

                let limitPrice1 = parseEther("1.5");
                let limitPrice2 = parseEther("1.5");
                let limitPrice3 = parseEther("4");
                let limitPrice4 = parseEther("4");

                await expect(
                    dex
                        .connect(ownerAcc)
                        .startSaleMultiple(
                            tokenA.address,
                            tokenB.address,
                            [
                                sellAmount1,
                                sellAmount2,
                                sellAmount3,
                                sellAmount4,
                            ],
                            [limitPrice1, limitPrice2, limitPrice3]
                        )
                ).to.be.revertedWithCustomError(dex, "DifferentLength");
            });
        });
    });

    // #MA
    describe("Match orders", () => {
        // #MALL
        describe("Limit and limit", () => {
            // #MALLBS
            describe("Buy matches sell", () => {
                // #MALLBSF
                describe("Full execution", () => {
                    it("Should match new limit order with existing limit order", async () => {
                        let { dex, adminToken, tokenA, tokenB } =
                            await loadFixture(deploysQuotedB);

                        let mintAmount = parseEther("1000000");
                        let sellAmount = parseEther("10");
                        let buyAmount = sellAmount;
                        let limitPrice = parseEther("1.5");
                        let nonce = 777;

                        // Mint some tokens to sell
                        await tokenB.mint(clientAcc1.address, mintAmount);
                        await tokenB
                            .connect(clientAcc1)
                            .approve(dex.address, mintAmount);

                        // Mint some tokens to pay for purchase
                        await tokenA.mint(clientAcc2.address, mintAmount);
                        await tokenA
                            .connect(clientAcc2)
                            .approve(dex.address, mintAmount);

                        // Balances in both tokens of both users
                        let sellerInitialSellingTokenBalance =
                            await tokenB.balanceOf(clientAcc1.address);
                        let sellerInitialReceivingTokenBalance =
                            await tokenA.balanceOf(clientAcc1.address);

                        let buyerInitialPayingTokenBalance =
                            await tokenA.balanceOf(clientAcc2.address);
                        let buyerInitialReceivingTokenBalance =
                            await tokenB.balanceOf(clientAcc2.address);

                        let dexInitialSellingTokenBalance =
                            await tokenB.balanceOf(dex.address);
                        let dexInitialReceivingTokenBalance =
                            await tokenA.balanceOf(dex.address);

                        let sellerShouldBeLocked = sellAmount;
                        let sellerShouldBeFee =
                            calcFeeAmount(sellerShouldBeLocked);

                        let buyerShouldBeLocked = calcBuyerLockAmount(
                            buyAmount,
                            limitPrice.div(2),
                            false
                        );
                        let buyerShouldBeSpent = calcBuyerSpentAmount(
                            buyAmount,
                            sellAmount,
                            limitPrice.div(2),
                            false,
                            false,
                            true
                        );
                        let buyerShouldBeFee =
                            calcFeeAmount(buyerShouldBeLocked);

                        // matchedOrder
                        await dex
                            .connect(clientAcc1)
                            .sellLimit(
                                tokenA.address,
                                tokenB.address,
                                sellAmount,
                                limitPrice
                            );

                        // initOrder
                        await dex
                            .connect(clientAcc2)
                            .buyLimit(
                                tokenB.address,
                                tokenA.address,
                                buyAmount,
                                limitPrice.div(2)
                            );

                        let [, pairInitialPrice] = await dex.getPrice(
                            tokenA.address,
                            tokenB.address
                        );

                        let signatureMatch = await hashAndSignMatch(
                            dex.address,
                            4,
                            [3],
                            777
                        );

                        await expect(
                            dex.matchOrders(4, [3], nonce, signatureMatch)
                        )
                            .to.emit(dex, "OrdersMatched")
                            .withArgs(4, 3);

                        let sellerEndSellingTokenBalance =
                            await tokenB.balanceOf(clientAcc1.address);
                        let sellerEndReceivingTokenBalance =
                            await tokenA.balanceOf(clientAcc1.address);

                        let buyerEndPayingTokenBalance = await tokenA.balanceOf(
                            clientAcc2.address
                        );
                        let buyerEndReceivingTokenBalance =
                            await tokenB.balanceOf(clientAcc2.address);

                        let dexEndSellingTokenBalance = await tokenB.balanceOf(
                            dex.address
                        );
                        let dexEndReceivingTokenBalance =
                            await tokenA.balanceOf(dex.address);

                        let [, pairEndPrice] = await dex.getPrice(
                            tokenA.address,
                            tokenB.address
                        );

                        // Pair price should decrease 2 times
                        expect(pairEndPrice).to.eq(pairInitialPrice.div(2));

                        // Seller sells whole selling amount and pays fee
                        expect(
                            sellerInitialSellingTokenBalance.sub(
                                sellerEndSellingTokenBalance
                            )
                        ).to.eq(sellAmount.add(sellerShouldBeFee));
                        // Buyer receives all sold tokens
                        expect(
                            buyerEndReceivingTokenBalance.sub(
                                buyerInitialReceivingTokenBalance
                            )
                        ).to.eq(sellAmount);
                        // Buyer locks all paying tokens and pays fee
                        expect(
                            buyerInitialPayingTokenBalance.sub(
                                buyerEndPayingTokenBalance
                            )
                        ).to.eq(buyerShouldBeLocked.add(buyerShouldBeFee));
                        // Seller receives payment for sold tokens
                        expect(
                            sellerEndReceivingTokenBalance.sub(
                                sellerInitialReceivingTokenBalance
                            )
                        ).to.eq(buyerShouldBeSpent);

                        // Both orders had the same amount so they both
                        // have to be filled
                        let initOrder = await dex.getOrder(4);
                        let initOrderAmount = initOrder[3];
                        let initOrderAmountFilled = initOrder[4];
                        let initOrderAmountLocked = initOrder[10];
                        let initOrderStatus = initOrder[11];

                        let matchedOrder = await dex.getOrder(3);
                        let matchedOrderAmount = matchedOrder[3];
                        let matchedOrderAmountFilled = matchedOrder[4];
                        let matchedOrderAmountLocked = matchedOrder[10];
                        let matchedOrderStatus = matchedOrder[11];

                        // Both orders should have a `Closed` status
                        expect(initOrderAmountFilled).to.eq(initOrderAmount);
                        expect(initOrderStatus).to.eq(2);

                        expect(matchedOrderAmountFilled).to.eq(
                            matchedOrderAmount
                        );
                        expect(matchedOrderStatus).to.eq(2);

                        // Whole lock of sell order should be spent
                        expect(matchedOrderAmountLocked).to.eq(0);

                        // Half of lock of buy order should be left
                        expect(initOrderAmountLocked).to.eq(
                            buyerShouldBeLocked.sub(buyerShouldBeSpent)
                        );

                        // Only fee from sell order should be left on dex balance
                        expect(
                            dexEndSellingTokenBalance.sub(
                                dexInitialSellingTokenBalance
                            )
                        ).to.eq(sellerShouldBeFee);
                        // Fee and some part of lock of buy order should be left on dex balance
                        expect(
                            dexEndReceivingTokenBalance.sub(
                                dexInitialReceivingTokenBalance
                            )
                        ).to.eq(
                            buyerShouldBeFee
                                .add(buyerShouldBeLocked)
                                .sub(buyerShouldBeSpent)
                        );
                    });
                });

                // #MALLBSP
                describe("Partial execution", () => {
                    it("Should match new limit order with existing limit order", async () => {
                        let { dex, adminToken, tokenA, tokenB } =
                            await loadFixture(deploysQuotedB);

                        let mintAmount = parseEther("1000000");
                        let sellAmount = parseEther("10");
                        // Buyer is ready to buy twice as much
                        let buyAmount = sellAmount.mul(2);
                        let limitPrice = parseEther("1.5");
                        let nonce = 777;

                        // Mint some tokens to sell
                        await tokenB.mint(clientAcc1.address, mintAmount);
                        await tokenB
                            .connect(clientAcc1)
                            .approve(dex.address, mintAmount);

                        // Mint some tokens to pay for purchase
                        await tokenA.mint(clientAcc2.address, mintAmount);
                        await tokenA
                            .connect(clientAcc2)
                            .approve(dex.address, mintAmount);

                        // Balances in both tokens of both users
                        let sellerInitialSellingTokenBalance =
                            await tokenB.balanceOf(clientAcc1.address);
                        let sellerInitialReceivingTokenBalance =
                            await tokenA.balanceOf(clientAcc1.address);

                        let buyerInitialPayingTokenBalance =
                            await tokenA.balanceOf(clientAcc2.address);
                        let buyerInitialReceivingTokenBalance =
                            await tokenB.balanceOf(clientAcc2.address);

                        let dexInitialSellingTokenBalance =
                            await tokenB.balanceOf(dex.address);
                        let dexInitialReceivingTokenBalance =
                            await tokenA.balanceOf(dex.address);

                        let sellerShouldBeLocked = sellAmount;
                        let sellerShouldBeFee =
                            calcFeeAmount(sellerShouldBeLocked);

                        // Buyer should lock using the price in buy order, not the market price
                        let buyerShouldBeLocked = calcBuyerLockAmount(
                            buyAmount,
                            limitPrice,
                            false
                        );
                        let buyerShouldBeSpent = calcBuyerSpentAmount(
                            buyAmount,
                            sellAmount,
                            limitPrice.mul(2),
                            false,
                            true,
                            true
                        );
                        let buyerShouldBeFee =
                            calcFeeAmount(buyerShouldBeLocked);

                        // matchedOrder
                        await dex
                            .connect(clientAcc1)
                            .sellLimit(
                                tokenA.address,
                                tokenB.address,
                                sellAmount,
                                limitPrice.mul(2)
                            );

                        // initOrder
                        await dex
                            .connect(clientAcc2)
                            .buyLimit(
                                tokenB.address,
                                tokenA.address,
                                buyAmount,
                                limitPrice
                            );

                        let a = await dex.getOrder(4);
                        let b = a[10];
                        expect(b).to.eq(buyerShouldBeLocked);

                        let signatureMatch = await hashAndSignMatch(
                            dex.address,
                            4,
                            [3],
                            777
                        );

                        await expect(
                            dex.matchOrders(4, [3], nonce, signatureMatch)
                        )
                            .to.emit(dex, "OrdersMatched")
                            .withArgs(4, 3);

                        let sellerEndSellingTokenBalance =
                            await tokenB.balanceOf(clientAcc1.address);
                        let sellerEndReceivingTokenBalance =
                            await tokenA.balanceOf(clientAcc1.address);

                        let buyerEndPayingTokenBalance = await tokenA.balanceOf(
                            clientAcc2.address
                        );
                        let buyerEndReceivingTokenBalance =
                            await tokenB.balanceOf(clientAcc2.address);

                        let dexEndSellingTokenBalance = await tokenB.balanceOf(
                            dex.address
                        );
                        let dexEndReceivingTokenBalance =
                            await tokenA.balanceOf(dex.address);

                        // Seller sells whole selling amount and pays fee
                        expect(
                            sellerInitialSellingTokenBalance.sub(
                                sellerEndSellingTokenBalance
                            )
                        ).to.eq(sellAmount.add(sellerShouldBeFee));
                        // Buyer receives all sold tokens
                        expect(
                            buyerEndReceivingTokenBalance.sub(
                                buyerInitialReceivingTokenBalance
                            )
                        ).to.eq(sellAmount);
                        // Buyer locks all paying tokens and pays fee
                        expect(
                            buyerInitialPayingTokenBalance.sub(
                                buyerEndPayingTokenBalance
                            )
                        ).to.eq(buyerShouldBeLocked.add(buyerShouldBeFee));
                        // Seller receives payment for sold tokens
                        expect(
                            sellerEndReceivingTokenBalance.sub(
                                sellerInitialReceivingTokenBalance
                            )
                        ).to.eq(buyerShouldBeSpent);

                        let initOrder = await dex.getOrder(4);
                        let initOrderAmount = initOrder[3];
                        let initOrderAmountFilled = initOrder[4];
                        let initOrderAmountLocked = initOrder[10];
                        let initOrderStatus = initOrder[11];

                        let matchedOrder = await dex.getOrder(3);
                        let matchedOrderAmount = matchedOrder[3];
                        let matchedOrderAmountFilled = matchedOrder[4];
                        let matchedOrderAmountLocked = matchedOrder[10];
                        let matchedOrderStatus = matchedOrder[11];

                        // Buy order should be partially filled because
                        // it has a bigger amount
                        // It should have a `PartiallyClosed` status
                        expect(initOrderAmountFilled).to.eq(
                            initOrderAmount.div(2)
                        );
                        expect(initOrderStatus).to.eq(1);

                        // Sell order should have a `Closed` status
                        expect(matchedOrderAmountFilled).to.eq(
                            matchedOrderAmount
                        );
                        expect(matchedOrderStatus).to.eq(2);

                        // Whole lock of sell order should be spent
                        expect(matchedOrderAmountLocked).to.eq(0);

                        // Half of lock of buy order should be left
                        expect(initOrderAmountLocked).to.eq(
                            buyerShouldBeLocked.sub(buyerShouldBeSpent)
                        );

                        // Only fee from sell order should be left on dex balance
                        expect(
                            dexEndSellingTokenBalance.sub(
                                dexInitialSellingTokenBalance
                            )
                        ).to.eq(sellerShouldBeFee);
                        // Fee and some part of lock of buy order should be left on dex balance
                        expect(
                            dexEndReceivingTokenBalance.sub(
                                dexInitialReceivingTokenBalance
                            )
                        ).to.eq(
                            buyerShouldBeFee.add(
                                buyerShouldBeLocked.sub(buyerShouldBeSpent)
                            )
                        );
                    });
                });
            });
            describe("Sell matches buy", () => {
                // #MALLSBF
                describe("Full execution", () => {
                    it("Should match new limit order with existing limit order", async () => {
                        let { dex, adminToken, tokenA, tokenB } =
                            await loadFixture(deploysQuotedB);

                        let mintAmount = parseEther("1000000");
                        let sellAmount = parseEther("10");
                        let buyAmount = sellAmount;
                        let limitPrice = parseEther("1.5");
                        let nonce = 777;

                        // Mint some tokens to sell
                        await tokenB.mint(clientAcc1.address, mintAmount);
                        await tokenB
                            .connect(clientAcc1)
                            .approve(dex.address, mintAmount);

                        // Mint some tokens to pay for purchase
                        await tokenA.mint(clientAcc2.address, mintAmount);
                        await tokenA
                            .connect(clientAcc2)
                            .approve(dex.address, mintAmount);

                        await tokenB
                            .connect(ownerAcc)
                            .approve(dex.address, sellAmount);

                        // Balances in both tokens of both users
                        let buyerInitialPayingTokenBalance =
                            await tokenB.balanceOf(clientAcc1.address);
                        let buyerInitialReceivingTokenBalance =
                            await tokenA.balanceOf(clientAcc1.address);

                        let sellerInitialSellingTokenBalance =
                            await tokenA.balanceOf(clientAcc2.address);
                        let sellerInitialReceivingTokenBalance =
                            await tokenB.balanceOf(clientAcc2.address);

                        let dexInitialSellingTokenBalance =
                            await tokenA.balanceOf(dex.address);
                        let dexInitialReceivingTokenBalance =
                            await tokenB.balanceOf(dex.address);

                        let buyerShouldBeLocked = calcBuyerLockAmount(
                            buyAmount,
                            limitPrice,
                            true
                        );
                        let buyerShouldBeSpent = calcBuyerSpentAmount(
                            sellAmount,
                            buyAmount,
                            limitPrice,
                            false,
                            false,
                            false
                        );
                        let buyerShouldBeFee =
                            calcFeeAmount(buyerShouldBeLocked);

                        let sellerShouldBeLocked = sellAmount;
                        let sellerShouldBeFee =
                            calcFeeAmount(sellerShouldBeLocked);

                        // Create the second order that will actually be matched afterwards
                        // matchedOrder
                        // ID3
                        await dex
                            .connect(clientAcc1)
                            .buyLimit(
                                tokenA.address,
                                tokenB.address,
                                buyAmount,
                                limitPrice
                            );

                        // initOrder
                        // ID4
                        await dex.connect(clientAcc2).sellLimit(
                            tokenB.address,
                            // make the same locked token as quoted token (in ID3)
                            tokenA.address,
                            sellAmount,
                            limitPrice
                        );

                        let signatureMatch = await hashAndSignMatch(
                            dex.address,
                            4,
                            [3],
                            nonce
                        );

                        await expect(
                            dex.matchOrders(4, [3], nonce, signatureMatch)
                        )
                            .to.emit(dex, "OrdersMatched")
                            .withArgs(4, 3);

                        let buyerEndPayingTokenBalance = await tokenB.balanceOf(
                            clientAcc1.address
                        );
                        let buyerEndReceivingTokenBalance =
                            await tokenA.balanceOf(clientAcc1.address);

                        let sellerEndSellingTokenBalance =
                            await tokenA.balanceOf(clientAcc2.address);
                        let sellerEndReceivingTokenBalance =
                            await tokenB.balanceOf(clientAcc2.address);

                        let dexEndSellingTokenBalance = await tokenA.balanceOf(
                            dex.address
                        );
                        let dexEndReceivingTokenBalance =
                            await tokenB.balanceOf(dex.address);

                        // Seller sells whole selling amount and pays fee
                        expect(
                            sellerInitialSellingTokenBalance.sub(
                                sellerEndSellingTokenBalance
                            )
                        ).to.eq(sellAmount.add(sellerShouldBeFee));
                        // Buyer receives all sold tokens
                        expect(
                            buyerEndReceivingTokenBalance.sub(
                                buyerInitialReceivingTokenBalance
                            )
                        ).to.eq(sellAmount);
                        // Buyer locks all paying tokens and pays fee
                        expect(
                            buyerInitialPayingTokenBalance.sub(
                                buyerEndPayingTokenBalance
                            )
                        ).to.eq(buyerShouldBeLocked.add(buyerShouldBeFee));
                        // Seller receives payment for sold tokens
                        expect(
                            sellerEndReceivingTokenBalance.sub(
                                sellerInitialReceivingTokenBalance
                            )
                        ).to.eq(buyerShouldBeSpent);

                        // Both orders had the same amount so they both
                        // have to be filled
                        let initOrder = await dex.getOrder(4);
                        let initOrderAmount = initOrder[3];
                        let initOrderAmountFilled = initOrder[4];
                        let initOrderAmountLocked = initOrder[10];
                        let initOrderStatus = initOrder[11];

                        let matchedOrder = await dex.getOrder(3);
                        let matchedOrderAmount = matchedOrder[3];
                        let matchedOrderAmountFilled = matchedOrder[4];
                        let matchedOrderAmountLocked = matchedOrder[10];
                        let matchedOrderStatus = matchedOrder[11];

                        // Both orders should have a `Closed` status
                        expect(initOrderAmountFilled).to.eq(initOrderAmount);
                        expect(initOrderStatus).to.eq(2);

                        expect(matchedOrderAmountFilled).to.eq(
                            matchedOrderAmount
                        );
                        expect(matchedOrderStatus).to.eq(2);

                        // Whole lock of sell order should be spent
                        expect(matchedOrderAmountLocked).to.eq(0);

                        // Half of lock of buy order should be left
                        expect(initOrderAmountLocked).to.eq(
                            buyerShouldBeLocked.sub(buyerShouldBeSpent)
                        );

                        // Only fee from sell order should be left on dex balance
                        expect(
                            dexEndSellingTokenBalance.sub(
                                dexInitialSellingTokenBalance
                            )
                        ).to.eq(sellerShouldBeFee);
                        // Fee and some part of lock of buy order should be left on dex balance
                        expect(
                            dexEndReceivingTokenBalance.sub(
                                dexInitialReceivingTokenBalance
                            )
                        ).to.eq(
                            buyerShouldBeFee
                                .add(buyerShouldBeLocked)
                                .sub(buyerShouldBeSpent)
                        );
                    });
                });
                // #MALLSBP
                describe("Partial execution", () => {
                    it("Should match new limit order with existing limit order", async () => {
                        let { dex, adminToken, tokenA, tokenB } =
                            await loadFixture(deploysQuotedB);

                        let mintAmount = parseEther("1000000");
                        let sellAmount = parseEther("10");
                        // Buyer is ready to buy twice as much
                        let buyAmount = sellAmount.mul(2);
                        let limitPrice = parseEther("1.5");
                        let nonce = 777;

                        // Mint some tokens to sell
                        await tokenB.mint(clientAcc1.address, mintAmount);
                        await tokenB
                            .connect(clientAcc1)
                            .approve(dex.address, mintAmount);

                        // Mint some tokens to pay for purchase
                        await tokenA.mint(clientAcc2.address, mintAmount);
                        await tokenA
                            .connect(clientAcc2)
                            .approve(dex.address, mintAmount);

                        await tokenB
                            .connect(ownerAcc)
                            .approve(dex.address, sellAmount);

                        // Balances in both tokens of both users
                        let buyerInitialPayingTokenBalance =
                            await tokenB.balanceOf(clientAcc1.address);
                        let buyerInitialReceivingTokenBalance =
                            await tokenA.balanceOf(clientAcc1.address);

                        let sellerInitialSellingTokenBalance =
                            await tokenA.balanceOf(clientAcc2.address);
                        let sellerInitialReceivingTokenBalance =
                            await tokenB.balanceOf(clientAcc2.address);

                        let dexInitialSellingTokenBalance =
                            await tokenA.balanceOf(dex.address);
                        let dexInitialReceivingTokenBalance =
                            await tokenB.balanceOf(dex.address);

                        let buyerShouldBeLocked = calcBuyerLockAmount(
                            buyAmount,
                            limitPrice,
                            // Use true because tokenB is quoted and we pay with it
                            true
                        );
                        let buyerShouldBeSpent = calcBuyerSpentAmount(
                            sellAmount,
                            buyAmount,
                            limitPrice,
                            false,
                            true,
                            false
                        );
                        let buyerShouldBeFee =
                            calcFeeAmount(buyerShouldBeLocked);

                        let sellerShouldBeLocked = sellAmount;
                        let sellerShouldBeFee =
                            calcFeeAmount(sellerShouldBeLocked);

                        // Create the second order that will actually be matched afterwards
                        // matchedOrder
                        // ID3
                        await dex
                            .connect(clientAcc1)
                            .buyLimit(
                                tokenA.address,
                                tokenB.address,
                                buyAmount,
                                limitPrice
                            );

                        // initOrder
                        // ID4
                        await dex
                            .connect(clientAcc2)
                            .sellLimit(
                                tokenB.address,
                                tokenA.address,
                                sellAmount,
                                limitPrice
                            );

                        let signatureMatch = await hashAndSignMatch(
                            dex.address,
                            4,
                            [3],
                            nonce
                        );

                        await expect(
                            dex.matchOrders(4, [3], nonce, signatureMatch)
                        )
                            .to.emit(dex, "OrdersMatched")
                            .withArgs(4, 3);

                        let buyerEndPayingTokenBalance = await tokenB.balanceOf(
                            clientAcc1.address
                        );
                        let buyerEndReceivingTokenBalance =
                            await tokenA.balanceOf(clientAcc1.address);

                        let sellerEndSellingTokenBalance =
                            await tokenA.balanceOf(clientAcc2.address);
                        let sellerEndReceivingTokenBalance =
                            await tokenB.balanceOf(clientAcc2.address);

                        let dexEndSellingTokenBalance = await tokenA.balanceOf(
                            dex.address
                        );
                        let dexEndReceivingTokenBalance =
                            await tokenB.balanceOf(dex.address);

                        // Seller sells whole selling amount and pays fee
                        expect(
                            sellerInitialSellingTokenBalance.sub(
                                sellerEndSellingTokenBalance
                            )
                        ).to.eq(sellAmount.add(sellerShouldBeFee));
                        // Buyer receives all sold tokens
                        expect(
                            buyerEndReceivingTokenBalance.sub(
                                buyerInitialReceivingTokenBalance
                            )
                        ).to.eq(sellAmount);
                        // Buyer locks all paying tokens and pays fee
                        expect(
                            buyerInitialPayingTokenBalance.sub(
                                buyerEndPayingTokenBalance
                            )
                        ).to.eq(buyerShouldBeLocked.add(buyerShouldBeFee));
                        // Seller receives payment for sold tokens
                        expect(
                            sellerEndReceivingTokenBalance.sub(
                                sellerInitialReceivingTokenBalance
                            )
                        ).to.eq(buyerShouldBeSpent);

                        let initOrder = await dex.getOrder(4);
                        let initOrderAmount = initOrder[3];
                        let initOrderAmountFilled = initOrder[4];
                        let initOrderAmountLocked = initOrder[10];
                        let initOrderStatus = initOrder[11];

                        let matchedOrder = await dex.getOrder(3);
                        let matchedOrderAmount = matchedOrder[3];
                        let matchedOrderAmountFilled = matchedOrder[4];
                        let matchedOrderAmountLocked = matchedOrder[10];
                        let matchedOrderStatus = matchedOrder[11];

                        // Buy order should be partially filled because
                        // it has a bigger amount
                        // It should have a `PartiallyClosed` status
                        expect(initOrderAmountFilled).to.eq(initOrderAmount);
                        expect(initOrderStatus).to.eq(2);

                        expect(matchedOrderAmountFilled).to.eq(
                            matchedOrderAmount.div(2)
                        );
                        expect(matchedOrderStatus).to.eq(1);

                        // Whole lock of sell order should be spent
                        expect(initOrderAmountLocked).to.eq(0);

                        // Half of lock of buy order should be left
                        expect(matchedOrderAmountLocked).to.eq(
                            buyerShouldBeLocked.sub(buyerShouldBeSpent)
                        );

                        // Only fee from sell order should be left on dex balance
                        expect(
                            dexEndSellingTokenBalance.sub(
                                dexInitialSellingTokenBalance
                            )
                        ).to.eq(sellerShouldBeFee);
                        // Fee and some part of lock of buy order should be left on dex balance
                        expect(
                            dexEndReceivingTokenBalance.sub(
                                dexInitialReceivingTokenBalance
                            )
                        ).to.eq(
                            buyerShouldBeFee
                                .add(buyerShouldBeLocked)
                                .sub(buyerShouldBeSpent)
                        );
                    });
                });
            });

            // #MAML
            describe("Market and limit", () => {
                // #MAMLBS
                describe("Buy matches sell", () => {
                    // #MAMLBSF
                    describe("Full execution", () => {
                        it("Should match new market order with existing limit order", async () => {
                            let { dex, adminToken, tokenA, tokenB } =
                                await loadFixture(deploysQuotedB);

                            let mintAmount = parseEther("1000000");
                            let sellAmount = parseEther("10");
                            let buyAmount = sellAmount;
                            let slippage = 10;
                            let limitPrice = parseEther("1.5");
                            let nonce = 777;

                            // Mint some tokens to sell
                            await tokenB.mint(clientAcc1.address, mintAmount);
                            await tokenB
                                .connect(clientAcc1)
                                .approve(dex.address, mintAmount);

                            // Mint some tokens to pay for purchase
                            await tokenA.mint(clientAcc2.address, mintAmount);
                            await tokenA
                                .connect(clientAcc2)
                                .approve(dex.address, mintAmount);

                            // Balances in both tokens of both users
                            let sellerInitialSellingTokenBalance =
                                await tokenB.balanceOf(clientAcc1.address);
                            let sellerInitialReceivingTokenBalance =
                                await tokenA.balanceOf(clientAcc1.address);

                            let buyerInitialPayingTokenBalance =
                                await tokenA.balanceOf(clientAcc2.address);
                            let buyerInitialReceivingTokenBalance =
                                await tokenB.balanceOf(clientAcc2.address);

                            let dexInitialSellingTokenBalance =
                                await tokenB.balanceOf(dex.address);
                            let dexInitialReceivingTokenBalance =
                                await tokenA.balanceOf(dex.address);

                            let sellerShouldBeLocked = sellAmount;
                            let sellerShouldBeFee =
                                calcFeeAmount(sellerShouldBeLocked);

                            let buyerShouldBeLocked = calcBuyerLockAmount(
                                buyAmount,
                                limitPrice,
                                false
                            );
                            let buyerShouldBeSpent = calcBuyerSpentAmount(
                                buyAmount,
                                sellAmount,
                                limitPrice,
                                false,
                                false,
                                true
                            );
                            let buyerShouldBeFee =
                                calcFeeAmount(buyerShouldBeLocked);

                            // matchedOrder
                            await dex
                                .connect(clientAcc1)
                                .sellLimit(
                                    tokenA.address,
                                    tokenB.address,
                                    sellAmount,
                                    limitPrice
                                );

                            let signatureMarket = await hashAndSignMarket(
                                dex.address,
                                tokenB.address,
                                tokenA.address,
                                buyAmount,
                                slippage,
                                nonce
                            );

                            // initOrder
                            await dex
                                .connect(clientAcc2)
                                .buyMarket(
                                    tokenB.address,
                                    tokenA.address,
                                    buyAmount,
                                    slippage,
                                    nonce,
                                    signatureMarket
                                );

                            let signatureMatch = await hashAndSignMatch(
                                dex.address,
                                4,
                                [3],
                                nonce
                            );

                            await expect(
                                dex.matchOrders(4, [3], nonce, signatureMatch)
                            )
                                .to.emit(dex, "OrdersMatched")
                                .withArgs(4, 3);

                            let sellerEndSellingTokenBalance =
                                await tokenB.balanceOf(clientAcc1.address);
                            let sellerEndReceivingTokenBalance =
                                await tokenA.balanceOf(clientAcc1.address);

                            let buyerEndPayingTokenBalance =
                                await tokenA.balanceOf(clientAcc2.address);
                            let buyerEndReceivingTokenBalance =
                                await tokenB.balanceOf(clientAcc2.address);

                            let dexEndSellingTokenBalance =
                                await tokenB.balanceOf(dex.address);
                            let dexEndReceivingTokenBalance =
                                await tokenA.balanceOf(dex.address);

                            // Seller sells whole selling amount and pays fee
                            expect(
                                sellerInitialSellingTokenBalance.sub(
                                    sellerEndSellingTokenBalance
                                )
                            ).to.eq(sellAmount.add(sellerShouldBeFee));
                            // Buyer receives all sold tokens
                            expect(
                                buyerEndReceivingTokenBalance.sub(
                                    buyerInitialReceivingTokenBalance
                                )
                            ).to.eq(sellAmount);
                            // Buyer locks all paying tokens and pays fee
                            expect(
                                buyerInitialPayingTokenBalance.sub(
                                    buyerEndPayingTokenBalance
                                )
                            ).to.eq(buyerShouldBeLocked.add(buyerShouldBeFee));
                            // Seller receives payment for sold tokens
                            expect(
                                sellerEndReceivingTokenBalance.sub(
                                    sellerInitialReceivingTokenBalance
                                )
                            ).to.eq(buyerShouldBeSpent);

                            // Both orders had the same amount so they both
                            // have to be filled
                            let initOrder = await dex.getOrder(4);
                            let initOrderAmount = initOrder[3];
                            let initOrderAmountFilled = initOrder[4];
                            let initOrderAmountLocked = initOrder[10];
                            let initOrderStatus = initOrder[11];

                            let matchedOrder = await dex.getOrder(3);
                            let matchedOrderAmount = matchedOrder[3];
                            let matchedOrderAmountFilled = matchedOrder[4];
                            let matchedOrderAmountLocked = matchedOrder[10];
                            let matchedOrderStatus = matchedOrder[11];

                            // Both orders should have a `Closed` status
                            expect(initOrderAmountFilled).to.eq(
                                initOrderAmount
                            );
                            expect(initOrderStatus).to.eq(2);

                            expect(matchedOrderAmountFilled).to.eq(
                                matchedOrderAmount
                            );
                            expect(matchedOrderStatus).to.eq(2);

                            // Whole lock of sell order should be spent
                            expect(matchedOrderAmountLocked).to.eq(0);

                            // Half of lock of buy order should be left
                            expect(initOrderAmountLocked).to.eq(
                                buyerShouldBeLocked.sub(buyerShouldBeSpent)
                            );

                            // Only fee from sell order should be left on dex balance
                            expect(
                                dexEndSellingTokenBalance.sub(
                                    dexInitialSellingTokenBalance
                                )
                            ).to.eq(sellerShouldBeFee);
                            // Fee and some part of lock of buy order should be left on dex balance
                            expect(
                                dexEndReceivingTokenBalance.sub(
                                    dexInitialReceivingTokenBalance
                                )
                            ).to.eq(
                                buyerShouldBeFee
                                    .add(buyerShouldBeLocked)
                                    .sub(buyerShouldBeSpent)
                            );
                        });
                    });

                    // #MAMLBSP
                    describe("Partial execution", () => {
                        it("Should match new market order with existing limit order", async () => {
                            let { dex, adminToken, tokenA, tokenB } =
                                await loadFixture(deploysQuotedB);

                            let mintAmount = parseEther("1000000");
                            let sellAmount = parseEther("10");
                            // Buyer is ready to buy twice as much
                            let buyAmount = sellAmount.mul(2);
                            let slippage = 10;
                            let limitPrice = parseEther("1.5");
                            let nonce = 777;

                            // Mint some tokens to sell
                            await tokenB.mint(clientAcc1.address, mintAmount);
                            await tokenB
                                .connect(clientAcc1)
                                .approve(dex.address, mintAmount);

                            // Mint some tokens to pay for purchase
                            await tokenA.mint(clientAcc2.address, mintAmount);
                            await tokenA
                                .connect(clientAcc2)
                                .approve(dex.address, mintAmount);

                            // Balances in both tokens of both users
                            let sellerInitialSellingTokenBalance =
                                await tokenB.balanceOf(clientAcc1.address);
                            let sellerInitialReceivingTokenBalance =
                                await tokenA.balanceOf(clientAcc1.address);

                            let buyerInitialPayingTokenBalance =
                                await tokenA.balanceOf(clientAcc2.address);
                            let buyerInitialReceivingTokenBalance =
                                await tokenB.balanceOf(clientAcc2.address);

                            let dexInitialSellingTokenBalance =
                                await tokenB.balanceOf(dex.address);
                            let dexInitialReceivingTokenBalance =
                                await tokenA.balanceOf(dex.address);

                            let sellerShouldBeLocked = sellAmount;
                            let sellerShouldBeFee =
                                calcFeeAmount(sellerShouldBeLocked);

                            // Buyer should lock using the price in buy order, not the market price
                            let buyerShouldBeLocked = calcBuyerLockAmount(
                                buyAmount,
                                limitPrice,
                                false
                            );
                            // BUT! Orders will be executed by later market price
                            // Calculate amount spent by buyer using market price
                            let buyerShouldBeSpent = calcBuyerSpentAmount(
                                buyAmount,
                                sellAmount,
                                limitPrice,
                                false,
                                true,
                                true
                            );
                            let buyerShouldBeFee =
                                calcFeeAmount(buyerShouldBeLocked);

                            // matchedOrder
                            await dex
                                .connect(clientAcc1)
                                .sellLimit(
                                    tokenA.address,
                                    tokenB.address,
                                    sellAmount,
                                    limitPrice
                                );

                            let signatureMarket = await hashAndSignMarket(
                                dex.address,
                                tokenB.address,
                                tokenA.address,
                                buyAmount,
                                slippage,
                                nonce
                            );

                            // initOrder
                            await dex
                                .connect(clientAcc2)
                                .buyMarket(
                                    tokenB.address,
                                    tokenA.address,
                                    buyAmount,
                                    slippage,
                                    nonce,
                                    signatureMarket
                                );

                            let signatureMatch = await hashAndSignMatch(
                                dex.address,
                                4,
                                [3],
                                nonce
                            );

                            await expect(
                                dex.matchOrders(4, [3], nonce, signatureMatch)
                            )
                                .to.emit(dex, "OrdersMatched")
                                .withArgs(4, 3);

                            let sellerEndSellingTokenBalance =
                                await tokenB.balanceOf(clientAcc1.address);
                            let sellerEndReceivingTokenBalance =
                                await tokenA.balanceOf(clientAcc1.address);

                            let buyerEndPayingTokenBalance =
                                await tokenA.balanceOf(clientAcc2.address);
                            let buyerEndReceivingTokenBalance =
                                await tokenB.balanceOf(clientAcc2.address);

                            let dexEndSellingTokenBalance =
                                await tokenB.balanceOf(dex.address);
                            let dexEndReceivingTokenBalance =
                                await tokenA.balanceOf(dex.address);

                            // Seller sells whole selling amount and pays fee
                            expect(
                                sellerInitialSellingTokenBalance.sub(
                                    sellerEndSellingTokenBalance
                                )
                            ).to.eq(sellAmount.add(sellerShouldBeFee));
                            // Buyer receives all sold tokens
                            expect(
                                buyerEndReceivingTokenBalance.sub(
                                    buyerInitialReceivingTokenBalance
                                )
                            ).to.eq(sellAmount);
                            // Buyer locks all paying tokens and pays fee
                            expect(
                                buyerInitialPayingTokenBalance.sub(
                                    buyerEndPayingTokenBalance
                                )
                            ).to.eq(buyerShouldBeLocked.add(buyerShouldBeFee));
                            // Seller receives payment for sold tokens
                            expect(
                                sellerEndReceivingTokenBalance.sub(
                                    sellerInitialReceivingTokenBalance
                                )
                            ).to.eq(buyerShouldBeSpent);

                            let initOrder = await dex.getOrder(4);
                            let initOrderAmount = initOrder[3];
                            let initOrderAmountFilled = initOrder[4];
                            let initOrderAmountLocked = initOrder[10];
                            let initOrderStatus = initOrder[11];

                            let matchedOrder = await dex.getOrder(3);
                            let matchedOrderAmount = matchedOrder[3];
                            let matchedOrderAmountFilled = matchedOrder[4];
                            let matchedOrderAmountLocked = matchedOrder[10];
                            let matchedOrderStatus = matchedOrder[11];

                            // Buy order should be partially filled because
                            // it has a bigger amount
                            // It should have a `PartiallyClosed` status
                            expect(initOrderAmountFilled).to.eq(
                                initOrderAmount.div(2)
                            );
                            expect(initOrderStatus).to.eq(1);

                            // Sell order should have a `Closed` status
                            expect(matchedOrderAmountFilled).to.eq(
                                matchedOrderAmount
                            );
                            expect(matchedOrderStatus).to.eq(2);

                            // Whole lock of sell order should be spent
                            expect(matchedOrderAmountLocked).to.eq(0);

                            // Half of lock of buy order should be left
                            expect(initOrderAmountLocked).to.eq(
                                buyerShouldBeLocked.sub(buyerShouldBeSpent)
                            );

                            // Only fee from sell order should be left on dex balance
                            expect(
                                dexEndSellingTokenBalance.sub(
                                    dexInitialSellingTokenBalance
                                )
                            ).to.eq(sellerShouldBeFee);
                            // Fee and some part of lock of buy order should be left on dex balance
                            expect(
                                dexEndReceivingTokenBalance.sub(
                                    dexInitialReceivingTokenBalance
                                )
                            ).to.eq(
                                buyerShouldBeFee.add(
                                    buyerShouldBeLocked.sub(buyerShouldBeSpent)
                                )
                            );
                        });
                    });
                });

                // #MAMLSB
                describe("Sell matches buy", () => {
                    // #MAMLSBF
                    describe("Full execution", () => {
                        it("Should match new market order with existing limit order", async () => {
                            let { dex, adminToken, tokenA, tokenB } =
                                await loadFixture(deploysQuotedB);

                            let mintAmount = parseEther("1000000");
                            let sellAmount = parseEther("10");
                            let buyAmount = sellAmount;
                            let slippage = 10;
                            let limitPrice = parseEther("1.5");
                            let nonce = 777;

                            // Mint some tokens to sell
                            await tokenB.mint(clientAcc1.address, mintAmount);
                            await tokenB
                                .connect(clientAcc1)
                                .approve(dex.address, mintAmount);

                            // Mint some tokens to pay for purchase
                            await tokenA.mint(clientAcc2.address, mintAmount);
                            await tokenA
                                .connect(clientAcc2)
                                .approve(dex.address, mintAmount);

                            await tokenB
                                .connect(ownerAcc)
                                .approve(dex.address, sellAmount);

                            // Balances in both tokens of both users
                            let buyerInitialPayingTokenBalance =
                                await tokenB.balanceOf(clientAcc1.address);
                            let buyerInitialReceivingTokenBalance =
                                await tokenA.balanceOf(clientAcc1.address);

                            let sellerInitialSellingTokenBalance =
                                await tokenA.balanceOf(clientAcc2.address);
                            let sellerInitialReceivingTokenBalance =
                                await tokenB.balanceOf(clientAcc2.address);

                            let dexInitialSellingTokenBalance =
                                await tokenA.balanceOf(dex.address);
                            let dexInitialReceivingTokenBalance =
                                await tokenB.balanceOf(dex.address);

                            let buyerShouldBeLocked = calcBuyerLockAmount(
                                buyAmount,
                                limitPrice,
                                true
                            );
                            let buyerShouldBeSpent = calcBuyerSpentAmount(
                                sellAmount,
                                buyAmount,
                                limitPrice,
                                false,
                                false,
                                false
                            );
                            let buyerShouldBeFee =
                                calcFeeAmount(buyerShouldBeLocked);

                            let sellerShouldBeLocked = sellAmount;
                            let sellerShouldBeFee =
                                calcFeeAmount(sellerShouldBeLocked);

                            // Create the second order that will actually be matched afterwards
                            // matchedOrder
                            // ID3
                            await dex
                                .connect(clientAcc1)
                                .buyLimit(
                                    tokenA.address,
                                    tokenB.address,
                                    buyAmount,
                                    limitPrice
                                );

                            let signatureMarket = await hashAndSignMarket(
                                dex.address,
                                tokenB.address,
                                tokenA.address,
                                buyAmount,
                                slippage,
                                nonce
                            );

                            // initOrder
                            // ID4
                            await dex.connect(clientAcc2).sellMarket(
                                tokenB.address,
                                // make the same locked token as quoted token (in ID3)
                                tokenA.address,
                                sellAmount,
                                slippage,
                                nonce,
                                signatureMarket
                            );

                            let signatureMatch = await hashAndSignMatch(
                                dex.address,
                                4,
                                [3],
                                nonce
                            );

                            await expect(
                                dex.matchOrders(4, [3], nonce, signatureMatch)
                            )
                                .to.emit(dex, "OrdersMatched")
                                .withArgs(4, 3);

                            let buyerEndPayingTokenBalance =
                                await tokenB.balanceOf(clientAcc1.address);
                            let buyerEndReceivingTokenBalance =
                                await tokenA.balanceOf(clientAcc1.address);

                            let sellerEndSellingTokenBalance =
                                await tokenA.balanceOf(clientAcc2.address);
                            let sellerEndReceivingTokenBalance =
                                await tokenB.balanceOf(clientAcc2.address);

                            let dexEndSellingTokenBalance =
                                await tokenA.balanceOf(dex.address);
                            let dexEndReceivingTokenBalance =
                                await tokenB.balanceOf(dex.address);

                            // Seller sells whole selling amount and pays fee
                            expect(
                                sellerInitialSellingTokenBalance.sub(
                                    sellerEndSellingTokenBalance
                                )
                            ).to.eq(sellAmount.add(sellerShouldBeFee));
                            // Buyer receives all sold tokens
                            expect(
                                buyerEndReceivingTokenBalance.sub(
                                    buyerInitialReceivingTokenBalance
                                )
                            ).to.eq(sellAmount);
                            // Buyer locks all paying tokens and pays fee
                            expect(
                                buyerInitialPayingTokenBalance.sub(
                                    buyerEndPayingTokenBalance
                                )
                            ).to.eq(buyerShouldBeLocked.add(buyerShouldBeFee));
                            // Seller receives payment for sold tokens
                            expect(
                                sellerEndReceivingTokenBalance.sub(
                                    sellerInitialReceivingTokenBalance
                                )
                            ).to.eq(buyerShouldBeSpent);

                            // Both orders had the same amount so they both
                            // have to be filled
                            let initOrder = await dex.getOrder(4);
                            let initOrderAmount = initOrder[3];
                            let initOrderAmountFilled = initOrder[4];
                            let initOrderAmountLocked = initOrder[10];
                            let initOrderStatus = initOrder[11];

                            let matchedOrder = await dex.getOrder(3);
                            let matchedOrderAmount = matchedOrder[3];
                            let matchedOrderAmountFilled = matchedOrder[4];
                            let matchedOrderAmountLocked = matchedOrder[10];
                            let matchedOrderStatus = matchedOrder[11];

                            // Both orders should have a `Closed` status
                            expect(initOrderAmountFilled).to.eq(
                                initOrderAmount
                            );
                            expect(initOrderStatus).to.eq(2);

                            expect(matchedOrderAmountFilled).to.eq(
                                matchedOrderAmount
                            );
                            expect(matchedOrderStatus).to.eq(2);

                            // Whole lock of sell order should be spent
                            expect(matchedOrderAmountLocked).to.eq(0);

                            // Half of lock of buy order should be left
                            expect(initOrderAmountLocked).to.eq(
                                buyerShouldBeLocked.sub(buyerShouldBeSpent)
                            );

                            // Only fee from sell order should be left on dex balance
                            expect(
                                dexEndSellingTokenBalance.sub(
                                    dexInitialSellingTokenBalance
                                )
                            ).to.eq(sellerShouldBeFee);
                            // Fee and some part of lock of buy order should be left on dex balance
                            expect(
                                dexEndReceivingTokenBalance.sub(
                                    dexInitialReceivingTokenBalance
                                )
                            ).to.eq(
                                buyerShouldBeFee
                                    .add(buyerShouldBeLocked)
                                    .sub(buyerShouldBeSpent)
                            );
                        });
                    });
                    // #MAMLSBP
                    describe("Partial execution", () => {
                        it("Should match new market order with existing limit order", async () => {
                            let { dex, adminToken, tokenA, tokenB } =
                                await loadFixture(deploysQuotedB);

                            let mintAmount = parseEther("1000000");
                            let sellAmount = parseEther("10");
                            // Buyer is ready to buy twice as much
                            let buyAmount = sellAmount.mul(2);
                            let slippage = 10;
                            let limitPrice = parseEther("1.5");
                            let nonce = 777;

                            // Mint some tokens to sell
                            await tokenB.mint(clientAcc1.address, mintAmount);
                            await tokenB
                                .connect(clientAcc1)
                                .approve(dex.address, mintAmount);

                            // Mint some tokens to pay for purchase
                            await tokenA.mint(clientAcc2.address, mintAmount);
                            await tokenA
                                .connect(clientAcc2)
                                .approve(dex.address, mintAmount);

                            await tokenB
                                .connect(ownerAcc)
                                .approve(dex.address, sellAmount);

                            // Balances in both tokens of both users
                            let buyerInitialPayingTokenBalance =
                                await tokenB.balanceOf(clientAcc1.address);
                            let buyerInitialReceivingTokenBalance =
                                await tokenA.balanceOf(clientAcc1.address);

                            let sellerInitialSellingTokenBalance =
                                await tokenA.balanceOf(clientAcc2.address);
                            let sellerInitialReceivingTokenBalance =
                                await tokenB.balanceOf(clientAcc2.address);

                            let dexInitialSellingTokenBalance =
                                await tokenA.balanceOf(dex.address);
                            let dexInitialReceivingTokenBalance =
                                await tokenB.balanceOf(dex.address);

                            let buyerShouldBeLocked = calcBuyerLockAmount(
                                buyAmount,
                                limitPrice,
                                true
                            );
                            let buyerShouldBeSpent = calcBuyerSpentAmount(
                                sellAmount,
                                buyAmount,
                                limitPrice,
                                false,
                                true,
                                false
                            );
                            let buyerShouldBeFee =
                                calcFeeAmount(buyerShouldBeLocked);

                            let sellerShouldBeLocked = sellAmount;
                            let sellerShouldBeFee =
                                calcFeeAmount(sellerShouldBeLocked);

                            // Create the second order that will actually be matched afterwards
                            // matchedOrder
                            // ID3
                            await dex
                                .connect(clientAcc1)
                                .buyLimit(
                                    tokenA.address,
                                    tokenB.address,
                                    buyAmount,
                                    limitPrice
                                );

                            let signatureMarket = await hashAndSignMarket(
                                dex.address,
                                tokenB.address,
                                tokenA.address,
                                sellAmount,
                                slippage,
                                nonce
                            );

                            // initOrder
                            // ID4
                            await dex.connect(clientAcc2).sellMarket(
                                tokenB.address,
                                // make the same locked token as quoted token (in ID3)
                                tokenA.address,
                                sellAmount,
                                slippage,
                                nonce,
                                signatureMarket
                            );

                            let signatureMatch = await hashAndSignMatch(
                                dex.address,
                                4,
                                [3],
                                nonce
                            );

                            await expect(
                                dex.matchOrders(4, [3], nonce, signatureMatch)
                            )
                                .to.emit(dex, "OrdersMatched")
                                .withArgs(4, 3);

                            let buyerEndPayingTokenBalance =
                                await tokenB.balanceOf(clientAcc1.address);
                            let buyerEndReceivingTokenBalance =
                                await tokenA.balanceOf(clientAcc1.address);

                            let sellerEndSellingTokenBalance =
                                await tokenA.balanceOf(clientAcc2.address);
                            let sellerEndReceivingTokenBalance =
                                await tokenB.balanceOf(clientAcc2.address);

                            let dexEndSellingTokenBalance =
                                await tokenA.balanceOf(dex.address);
                            let dexEndReceivingTokenBalance =
                                await tokenB.balanceOf(dex.address);

                            // Seller sells whole selling amount and pays fee
                            expect(
                                sellerInitialSellingTokenBalance.sub(
                                    sellerEndSellingTokenBalance
                                )
                            ).to.eq(sellAmount.add(sellerShouldBeFee));
                            // Buyer receives all sold tokens
                            expect(
                                buyerEndReceivingTokenBalance.sub(
                                    buyerInitialReceivingTokenBalance
                                )
                            ).to.eq(sellAmount);
                            // Buyer locks all paying tokens and pays fee
                            expect(
                                buyerInitialPayingTokenBalance.sub(
                                    buyerEndPayingTokenBalance
                                )
                            ).to.eq(buyerShouldBeLocked.add(buyerShouldBeFee));
                            // Seller receives payment for sold tokens
                            expect(
                                sellerEndReceivingTokenBalance.sub(
                                    sellerInitialReceivingTokenBalance
                                )
                            ).to.eq(buyerShouldBeSpent);

                            // Both orders had the same amount so they both
                            // have to be filled
                            let initOrder = await dex.getOrder(4);
                            let initOrderAmount = initOrder[3];
                            let initOrderAmountFilled = initOrder[4];
                            let initOrderAmountLocked = initOrder[10];
                            let initOrderStatus = initOrder[11];

                            let matchedOrder = await dex.getOrder(3);
                            let matchedOrderAmount = matchedOrder[3];
                            let matchedOrderAmountFilled = matchedOrder[4];
                            let matchedOrderAmountLocked = matchedOrder[10];
                            let matchedOrderStatus = matchedOrder[11];

                            // Buy order should be partially filled because
                            // it has a bigger amount
                            // It should have a `PartiallyClosed` status
                            expect(matchedOrderAmountFilled).to.eq(
                                matchedOrderAmount.div(2)
                            );
                            expect(matchedOrderStatus).to.eq(1);

                            // Sell order should have a `Closed` status
                            expect(initOrderAmountFilled).to.eq(
                                initOrderAmount
                            );
                            expect(initOrderStatus).to.eq(2);

                            // Whole lock of sell order should be spent
                            expect(initOrderAmountLocked).to.eq(0);

                            // Half of lock of buy order should be left
                            expect(matchedOrderAmountLocked).to.eq(
                                buyerShouldBeLocked.sub(buyerShouldBeSpent)
                            );

                            // Only fee from sell order should be left on dex balance
                            expect(
                                dexEndSellingTokenBalance.sub(
                                    dexInitialSellingTokenBalance
                                )
                            ).to.eq(sellerShouldBeFee);
                            // Fee and some part of lock of buy order should be left on dex balance
                            expect(
                                dexEndReceivingTokenBalance.sub(
                                    dexInitialReceivingTokenBalance
                                )
                            ).to.eq(
                                buyerShouldBeFee.add(
                                    buyerShouldBeLocked.sub(buyerShouldBeSpent)
                                )
                            );
                        });
                    });
                });
            });

            // #MAR
            describe("Reverts", () => {
                it("Should revert if slippage was too high(Buy side)", async () => {
                    let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                        deploysQuotedB
                    );

                    let mintAmount = parseEther("1000000");
                    let sellAmount = parseEther("10");
                    let buyAmount = sellAmount;
                    // Make slippage 10%. Revert in any case
                    let slippage = 10;
                    // Initial price to be set in the first order
                    let initialPrice = parseEther("1");
                    // Price of the second order should be lower to cause slippage
                    let limitPrice = initialPrice.div(5);
                    let nonce = 777;

                    // Mint some tokens to sell
                    await tokenB.mint(clientAcc1.address, mintAmount);
                    await tokenB
                        .connect(clientAcc1)
                        .approve(dex.address, mintAmount);

                    // Mint some tokens to pay for purchase
                    await tokenA.mint(clientAcc2.address, mintAmount);
                    await tokenA
                        .connect(clientAcc2)
                        .approve(dex.address, mintAmount);

                    // Create another limit order to be matched later
                    // ID3
                    await dex
                        .connect(clientAcc1)
                        .sellLimit(
                            tokenA.address,
                            tokenB.address,
                            sellAmount,
                            limitPrice
                        );

                    let signatureMarket = await hashAndSignMarket(
                        dex.address,
                        tokenB.address,
                        tokenA.address,
                        buyAmount,
                        slippage,
                        nonce
                    );

                    // ID4
                    await dex
                        .connect(clientAcc2)
                        .buyMarket(
                            tokenB.address,
                            tokenA.address,
                            buyAmount,
                            slippage,
                            nonce,
                            signatureMarket
                        );

                    let signatureMatch = await hashAndSignMatch(
                        dex.address,
                        4,
                        [3],
                        nonce
                    );

                    await expect(
                        dex.matchOrders(4, [3], nonce, signatureMatch)
                    ).to.be.revertedWithCustomError(dex, "SlippageTooBig");
                });

                it("Should revert if slippage was too high(Sell side)", async () => {
                    let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                        deploysQuotedB
                    );

                    let mintAmount = parseEther("1000000");
                    let sellAmount = parseEther("10");
                    let buyAmount = sellAmount;
                    // Make slippage 10%. Revert in any case
                    let slippage = 10;
                    // Initial price to be set in the first order
                    let initialPrice = parseEther("1");
                    // Price of the second order should be lower to cause slippage
                    let limitPrice = initialPrice.mul(5);
                    let nonce = 777;

                    // Mint some tokens to sell
                    await tokenB.mint(clientAcc1.address, mintAmount);
                    await tokenB
                        .connect(clientAcc1)
                        .approve(dex.address, mintAmount);

                    // Mint some tokens to pay for purchase
                    await tokenA.mint(clientAcc2.address, mintAmount);
                    await tokenA
                        .connect(clientAcc2)
                        .approve(dex.address, mintAmount);

                    // Create another limit order to be matched later
                    // ID3
                    await dex
                        .connect(clientAcc1)
                        .buyLimit(
                            tokenA.address,
                            tokenB.address,
                            buyAmount,
                            limitPrice
                        );

                    let signatureMarket = await hashAndSignMarket(
                        dex.address,
                        tokenB.address,
                        tokenA.address,
                        sellAmount,
                        slippage,
                        nonce
                    );

                    // ID4
                    await dex
                        .connect(clientAcc2)
                        .sellMarket(
                            tokenB.address,
                            tokenA.address,
                            sellAmount,
                            slippage,
                            nonce,
                            signatureMarket
                        );

                    let signatureMatch = await hashAndSignMatch(
                        dex.address,
                        4,
                        [3],
                        nonce
                    );

                    await expect(
                        dex.matchOrders(4, [3], nonce, signatureMatch)
                    ).to.be.revertedWithCustomError(dex, "SlippageTooBig");
                });
            });

            // #MAE
            // Some specific cases to increase % of coverage
            describe("Extras", () => {
                describe("Test _getAmounts function branches", () => {
                    // NOTICE:
                    // All orders are limit
                    // All orders are fully executed
                    it("Should match greater buy order with smaller sell order when buy order tokenB is quoted", async () => {
                        let { dex, adminToken, tokenA, tokenB } =
                            await loadFixture(deploysNoQuoted);

                        // Start sales and create two pairs of tokens

                        // ID1
                        let sellAmount = parseEther("10");
                        let mintAmount = parseEther("1000000");
                        let buyAmount = sellAmount.mul(2);
                        let limitPrice = parseEther("1.5");
                        let nonce = 777;

                        await dex
                            .connect(ownerAcc)
                            .startSaleSingle(
                                tokenB.address,
                                tokenA.address,
                                sellAmount,
                                limitPrice
                            );

                        // ID2
                        await dex
                            .connect(ownerAcc)
                            .startSaleSingle(
                                tokenA.address,
                                tokenB.address,
                                sellAmount,
                                limitPrice
                            );

                        // Mint some tokens to sell
                        await tokenB.mint(clientAcc1.address, mintAmount);
                        await tokenB
                            .connect(clientAcc1)
                            .approve(dex.address, mintAmount);

                        // Mint some tokens to pay for purchase
                        await tokenA.mint(clientAcc2.address, mintAmount);
                        await tokenA
                            .connect(clientAcc2)
                            .approve(dex.address, mintAmount);

                        await tokenA
                            .connect(ownerAcc)
                            .approve(dex.address, mintAmount);

                        // Balances in both tokens of both users
                        let sellerInitialSellingTokenBalance =
                            await tokenB.balanceOf(clientAcc1.address);
                        let sellerInitialReceivingTokenBalance =
                            await tokenA.balanceOf(clientAcc1.address);

                        let buyerInitialPayingTokenBalance =
                            await tokenA.balanceOf(clientAcc2.address);
                        let buyerInitialReceivingTokenBalance =
                            await tokenB.balanceOf(clientAcc2.address);

                        let dexInitialSellingTokenBalance =
                            await tokenB.balanceOf(dex.address);
                        let dexInitialReceivingTokenBalance =
                            await tokenA.balanceOf(dex.address);

                        let sellerShouldBeLocked = sellAmount;
                        let sellerShouldBeFee =
                            calcFeeAmount(sellerShouldBeLocked);

                        let buyerShouldBeLocked = calcBuyerLockAmount(
                            buyAmount,
                            limitPrice,
                            true
                        );
                        let buyerShouldBeSpent = calcBuyerSpentAmount(
                            buyAmount,
                            sellAmount,
                            limitPrice,
                            true,
                            true,
                            true
                        );
                        let buyerShouldBeFee =
                            calcFeeAmount(buyerShouldBeLocked);

                        // matchedOrder
                        // ID3
                        await dex
                            .connect(clientAcc1)
                            .sellLimit(
                                tokenA.address,
                                tokenB.address,
                                sellAmount,
                                limitPrice
                            );

                        // initOrder
                        // ID4
                        await dex
                            .connect(clientAcc2)
                            .buyLimit(
                                tokenB.address,
                                tokenA.address,
                                buyAmount,
                                limitPrice
                            );

                        let signatureMatch = await hashAndSignMatch(
                            dex.address,
                            4,
                            [3],
                            nonce
                        );

                        await expect(
                            dex.matchOrders(4, [3], nonce, signatureMatch)
                        )
                            .to.emit(dex, "OrdersMatched")
                            .withArgs(4, 3);

                        let sellerEndSellingTokenBalance =
                            await tokenB.balanceOf(clientAcc1.address);
                        let sellerEndReceivingTokenBalance =
                            await tokenA.balanceOf(clientAcc1.address);

                        let buyerEndPayingTokenBalance = await tokenA.balanceOf(
                            clientAcc2.address
                        );
                        let buyerEndReceivingTokenBalance =
                            await tokenB.balanceOf(clientAcc2.address);

                        let dexEndSellingTokenBalance = await tokenB.balanceOf(
                            dex.address
                        );
                        let dexEndReceivingTokenBalance =
                            await tokenA.balanceOf(dex.address);

                        // Seller sells whole selling amount and pays fee
                        expect(
                            sellerInitialSellingTokenBalance.sub(
                                sellerEndSellingTokenBalance
                            )
                        ).to.eq(sellAmount.add(sellerShouldBeFee));
                        // Buyer receives all sold tokens
                        expect(
                            buyerEndReceivingTokenBalance.sub(
                                buyerInitialReceivingTokenBalance
                            )
                        ).to.eq(sellAmount);
                        // Buyer locks all paying tokens and pays fee
                        expect(
                            buyerInitialPayingTokenBalance.sub(
                                buyerEndPayingTokenBalance
                            )
                        ).to.eq(buyerShouldBeLocked.add(buyerShouldBeFee));
                        // Seller receives payment for sold tokens
                        expect(
                            sellerEndReceivingTokenBalance.sub(
                                sellerInitialReceivingTokenBalance
                            )
                        ).to.eq(buyerShouldBeSpent);

                        let initOrder = await dex.getOrder(4);
                        let initOrderAmount = initOrder[3];
                        let initOrderAmountFilled = initOrder[4];
                        let initOrderAmountLocked = initOrder[10];
                        let initOrderStatus = initOrder[11];

                        let matchedOrder = await dex.getOrder(3);
                        let matchedOrderAmount = matchedOrder[3];
                        let matchedOrderAmountFilled = matchedOrder[4];
                        let matchedOrderAmountLocked = matchedOrder[10];
                        let matchedOrderStatus = matchedOrder[11];

                        expect(initOrderAmountFilled).to.eq(
                            initOrderAmount.div(2)
                        );
                        expect(initOrderStatus).to.eq(1);

                        // Sell order should be closed
                        expect(matchedOrderAmountFilled).to.eq(
                            matchedOrderAmount
                        );
                        expect(matchedOrderStatus).to.eq(2);

                        // Whole lock of sell order should be spent
                        expect(matchedOrderAmountLocked).to.eq(0);
                        // Half of lock of buy order should be left
                        expect(initOrderAmountLocked).to.eq(
                            buyerShouldBeLocked.sub(buyerShouldBeSpent)
                        );

                        // Only fee from sell order should be left
                        expect(
                            dexEndSellingTokenBalance.sub(
                                dexInitialSellingTokenBalance
                            )
                        ).to.eq(sellerShouldBeFee);
                        // Fee and some locked amount should be left from buy order
                        expect(
                            dexEndReceivingTokenBalance.sub(
                                dexInitialReceivingTokenBalance
                            )
                        ).to.eq(
                            buyerShouldBeLocked
                                .sub(buyerShouldBeSpent)
                                .add(buyerShouldBeFee)
                        );
                    });

                    it("Should match smaller buy order with greater sell order when buy order tokenB is quoted", async () => {
                        let { dex, adminToken, tokenA, tokenB } =
                            await loadFixture(deploysNoQuoted);

                        let sellAmount = parseEther("10");
                        let mintAmount = parseEther("1000000");
                        let buyAmount = sellAmount.div(2);
                        let limitPrice = parseEther("1.5");
                        let nonce = 777;

                        // ID1
                        await dex
                            .connect(ownerAcc)
                            .startSaleSingle(
                                tokenB.address,
                                tokenA.address,
                                sellAmount,
                                limitPrice
                            );

                        // ID2
                        await dex
                            .connect(ownerAcc)
                            .startSaleSingle(
                                tokenA.address,
                                tokenB.address,
                                sellAmount,
                                limitPrice
                            );

                        // Mint some tokens to sell
                        await tokenB.mint(clientAcc1.address, mintAmount);
                        await tokenB
                            .connect(clientAcc1)
                            .approve(dex.address, mintAmount);

                        // Mint some tokens to pay for purchase
                        await tokenA.mint(clientAcc2.address, mintAmount);
                        await tokenA
                            .connect(clientAcc2)
                            .approve(dex.address, mintAmount);

                        await tokenA
                            .connect(ownerAcc)
                            .approve(dex.address, mintAmount);

                        // Balances in both tokens of both users
                        let sellerInitialSellingTokenBalance =
                            await tokenB.balanceOf(clientAcc1.address);
                        let sellerInitialReceivingTokenBalance =
                            await tokenA.balanceOf(clientAcc1.address);

                        let buyerInitialPayingTokenBalance =
                            await tokenA.balanceOf(clientAcc2.address);
                        let buyerInitialReceivingTokenBalance =
                            await tokenB.balanceOf(clientAcc2.address);

                        let dexInitialSellingTokenBalance =
                            await tokenB.balanceOf(dex.address);
                        let dexInitialReceivingTokenBalance =
                            await tokenA.balanceOf(dex.address);

                        let sellerShouldBeLocked = sellAmount;
                        let sellerShouldBeSpent = calcSellerSpentAmount(
                            buyAmount,
                            sellAmount,
                            limitPrice,
                            true,
                            true,
                            false
                        );
                        let sellerShouldBeFee =
                            calcFeeAmount(sellerShouldBeLocked);

                        let buyerShouldBeLocked = calcBuyerLockAmount(
                            buyAmount,
                            limitPrice,
                            true
                        );
                        let buyerShouldBeSpent = calcBuyerSpentAmount(
                            buyAmount,
                            sellAmount,
                            limitPrice,
                            true,
                            false,
                            true
                        );
                        let buyerShouldBeFee =
                            calcFeeAmount(buyerShouldBeLocked);

                        // matchedOrder
                        // ID3
                        await dex
                            .connect(clientAcc1)
                            .sellLimit(
                                tokenA.address,
                                tokenB.address,
                                sellAmount,
                                limitPrice
                            );

                        // initOrder
                        // ID4
                        await dex
                            .connect(clientAcc2)
                            .buyLimit(
                                tokenB.address,
                                tokenA.address,
                                buyAmount,
                                limitPrice
                            );

                        let signatureMatch = await hashAndSignMatch(
                            dex.address,
                            4,
                            [3],
                            nonce
                        );

                        await expect(
                            dex.matchOrders(4, [3], nonce, signatureMatch)
                        )
                            .to.emit(dex, "OrdersMatched")
                            .withArgs(4, 3);

                        let sellerEndSellingTokenBalance =
                            await tokenB.balanceOf(clientAcc1.address);
                        let sellerEndReceivingTokenBalance =
                            await tokenA.balanceOf(clientAcc1.address);

                        let buyerEndPayingTokenBalance = await tokenA.balanceOf(
                            clientAcc2.address
                        );
                        let buyerEndReceivingTokenBalance =
                            await tokenB.balanceOf(clientAcc2.address);

                        let dexEndSellingTokenBalance = await tokenB.balanceOf(
                            dex.address
                        );
                        let dexEndReceivingTokenBalance =
                            await tokenA.balanceOf(dex.address);

                        // Seller sells whole selling amount and pays fee
                        expect(
                            sellerInitialSellingTokenBalance.sub(
                                sellerEndSellingTokenBalance
                            )
                        ).to.eq(sellAmount.add(sellerShouldBeFee));
                        // Buyer receives all sold tokens
                        expect(
                            buyerEndReceivingTokenBalance.sub(
                                buyerInitialReceivingTokenBalance
                            )
                        ).to.eq(sellerShouldBeSpent);
                        // Buyer locks all paying tokens and pays fee
                        expect(
                            buyerInitialPayingTokenBalance.sub(
                                buyerEndPayingTokenBalance
                            )
                        ).to.eq(buyerShouldBeLocked.add(buyerShouldBeFee));
                        // Seller receives payment for sold tokens
                        expect(
                            sellerEndReceivingTokenBalance.sub(
                                sellerInitialReceivingTokenBalance
                            )
                        ).to.eq(buyerShouldBeSpent);

                        let initOrder = await dex.getOrder(4);
                        let initOrderAmount = initOrder[3];
                        let initOrderAmountFilled = initOrder[4];
                        let initOrderAmountLocked = initOrder[10];
                        let initOrderStatus = initOrder[11];

                        let matchedOrder = await dex.getOrder(3);
                        let matchedOrderAmount = matchedOrder[3];
                        let matchedOrderAmountFilled = matchedOrder[4];
                        let matchedOrderAmountLocked = matchedOrder[10];
                        let matchedOrderStatus = matchedOrder[11];

                        // Buy order should be closed
                        expect(initOrderAmountFilled).to.eq(initOrderAmount);
                        expect(initOrderStatus).to.eq(2);

                        // Whole lock of buy order should be spent
                        expect(initOrderAmountLocked).to.eq(0);
                        // Half of lock of sell order should be left
                        expect(matchedOrderAmountLocked).to.eq(
                            sellerShouldBeLocked.sub(sellerShouldBeSpent)
                        );

                        // Only fee from buy order should be left
                        expect(
                            dexEndReceivingTokenBalance.sub(
                                dexInitialReceivingTokenBalance
                            )
                        ).to.eq(buyerShouldBeFee);
                        // Fee and some locked amount should be left from sell order
                        expect(
                            dexEndSellingTokenBalance.sub(
                                dexInitialSellingTokenBalance
                            )
                        ).to.eq(
                            sellerShouldBeLocked
                                .sub(sellerShouldBeSpent)
                                .add(sellerShouldBeFee)
                        );
                    });

                    it("Should match greater sell order with smaller buy order when sell order tokenB is quoted", async () => {
                        let { dex, adminToken, tokenA, tokenB } =
                            await loadFixture(deploysNoQuoted);

                        let sellAmount = parseEther("10");
                        let mintAmount = parseEther("1000000");
                        let buyAmount = sellAmount.div(2);
                        let limitPrice = parseEther("1.5");
                        let nonce = 777;

                        // ID1
                        await dex
                            .connect(ownerAcc)
                            .startSaleSingle(
                                tokenB.address,
                                tokenA.address,
                                sellAmount,
                                limitPrice
                            );

                        // ID2
                        await dex
                            .connect(ownerAcc)
                            .startSaleSingle(
                                tokenA.address,
                                tokenB.address,
                                sellAmount,
                                limitPrice
                            );

                        // Mint some tokens to sell
                        await tokenB.mint(clientAcc1.address, mintAmount);
                        await tokenB
                            .connect(clientAcc1)
                            .approve(dex.address, mintAmount);

                        // Mint some tokens to pay for purchase
                        await tokenA.mint(clientAcc2.address, mintAmount);
                        await tokenA
                            .connect(clientAcc2)
                            .approve(dex.address, mintAmount);

                        await tokenA
                            .connect(ownerAcc)
                            .approve(dex.address, mintAmount);

                        let buyerInitialPayingTokenBalance =
                            await tokenB.balanceOf(clientAcc1.address);
                        let buyerInitialReceivingTokenBalance =
                            await tokenA.balanceOf(clientAcc1.address);

                        let sellerInitialSellingTokenBalance =
                            await tokenA.balanceOf(clientAcc2.address);
                        let sellerInitialReceivingTokenBalance =
                            await tokenB.balanceOf(clientAcc2.address);

                        let dexInitialSellingTokenBalance =
                            await tokenA.balanceOf(dex.address);
                        let dexInitialReceivingTokenBalance =
                            await tokenB.balanceOf(dex.address);

                        let buyerShouldBeLocked = calcBuyerLockAmount(
                            buyAmount,
                            limitPrice,
                            false
                        );
                        let buyerShouldBeSpent = calcBuyerSpentAmount(
                            sellAmount,
                            buyAmount,
                            limitPrice,
                            true,
                            false,
                            false
                        );

                        let buyerShouldBeFee =
                            calcFeeAmount(buyerShouldBeLocked);

                        let sellerShouldBeLocked = sellAmount;
                        let sellerShouldBeSpent = calcSellerSpentAmount(
                            sellAmount,
                            buyAmount,
                            limitPrice,
                            true,
                            true,
                            true
                        );
                        let sellerShouldBeFee =
                            calcFeeAmount(sellerShouldBeLocked);

                        // matchedOrder
                        // ID3
                        await dex
                            .connect(clientAcc1)
                            .buyLimit(
                                tokenA.address,
                                tokenB.address,
                                buyAmount,
                                limitPrice
                            );

                        // initOrder
                        // ID4
                        await dex
                            .connect(clientAcc2)
                            .sellLimit(
                                tokenB.address,
                                tokenA.address,
                                sellAmount,
                                limitPrice
                            );

                        let signatureMatch = await hashAndSignMatch(
                            dex.address,
                            4,
                            [3],
                            nonce
                        );

                        await expect(
                            dex.matchOrders(4, [3], nonce, signatureMatch)
                        )
                            .to.emit(dex, "OrdersMatched")
                            .withArgs(4, 3);

                        let buyerEndPayingTokenBalance = await tokenB.balanceOf(
                            clientAcc1.address
                        );
                        let buyerEndReceivingTokenBalance =
                            await tokenA.balanceOf(clientAcc1.address);

                        let sellerEndSellingTokenBalance =
                            await tokenA.balanceOf(clientAcc2.address);
                        let sellerEndReceivingTokenBalance =
                            await tokenB.balanceOf(clientAcc2.address);

                        let dexEndSellingTokenBalance = await tokenA.balanceOf(
                            dex.address
                        );
                        let dexEndReceivingTokenBalance =
                            await tokenB.balanceOf(dex.address);

                        // Seller locks all his tokens and pays fee
                        expect(
                            sellerInitialSellingTokenBalance.sub(
                                sellerEndSellingTokenBalance
                            )
                        ).to.eq(sellerShouldBeLocked.add(sellerShouldBeFee));
                        // Buyer receives part of sold tokens
                        expect(
                            buyerEndReceivingTokenBalance.sub(
                                buyerInitialReceivingTokenBalance
                            )
                        ).to.eq(buyAmount);
                        // Buyer pays for purchased tokens
                        expect(
                            buyerInitialPayingTokenBalance.sub(
                                buyerEndPayingTokenBalance
                            )
                        ).to.eq(buyerShouldBeLocked.add(buyerShouldBeFee));
                        // Seller receives payment for sold tokens
                        expect(
                            sellerEndReceivingTokenBalance.sub(
                                sellerInitialReceivingTokenBalance
                            )
                        ).to.eq(buyerShouldBeSpent);

                        let initOrder = await dex.getOrder(4);
                        let initOrderAmount = initOrder[3];
                        let initOrderAmountFilled = initOrder[4];
                        let initOrderAmountLocked = initOrder[10];
                        let initOrderStatus = initOrder[11];

                        let matchedOrder = await dex.getOrder(3);
                        let matchedOrderAmount = matchedOrder[3];
                        let matchedOrderAmountFilled = matchedOrder[4];
                        let matchedOrderAmountLocked = matchedOrder[10];
                        let matchedOrderStatus = matchedOrder[11];

                        // Buy order should be closed
                        expect(matchedOrderAmountFilled).to.eq(
                            matchedOrderAmount
                        );
                        expect(matchedOrderStatus).to.eq(2);

                        // Whole lock of buy order should be spent
                        expect(matchedOrderAmountLocked).to.eq(0);
                        // Half of lock of sell order should be left
                        expect(initOrderAmountLocked).to.eq(
                            sellerShouldBeLocked.sub(sellerShouldBeSpent)
                        );

                        // Only fee from buy order should be left
                        expect(
                            dexEndReceivingTokenBalance.sub(
                                dexInitialReceivingTokenBalance
                            )
                        ).to.eq(buyerShouldBeFee);
                        // Fee and some locked amount should be left from sell order
                        expect(
                            dexEndSellingTokenBalance.sub(
                                dexInitialSellingTokenBalance
                            )
                        ).to.eq(
                            sellerShouldBeLocked
                                .sub(sellerShouldBeSpent)
                                .add(sellerShouldBeFee)
                        );
                    });
                });

                it("Should match greater sell order with smaller buy order when sell order tokenA is quoted", async () => {
                    let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                        deploysQuotedB
                    );

                    let mintAmount = parseEther("1000000");
                    let buyAmount = parseEther("10");
                    // Seller is ready to sell twice as much
                    let sellAmount = buyAmount.mul(2);
                    let limitPrice = parseEther("1.5");
                    let nonce = 777;

                    // Mint some tokens to sell
                    await tokenB.mint(clientAcc1.address, mintAmount);
                    await tokenB
                        .connect(clientAcc1)
                        .approve(dex.address, mintAmount);

                    // Mint some tokens to pay for purchase
                    await tokenA.mint(clientAcc2.address, mintAmount);
                    await tokenA
                        .connect(clientAcc2)
                        .approve(dex.address, mintAmount);

                    await tokenA
                        .connect(ownerAcc)
                        .approve(dex.address, mintAmount);

                    let buyerInitialReceivingTokenBalance =
                        await tokenA.balanceOf(clientAcc1.address);

                    let buyerInitialPayingTokenBalance = await tokenB.balanceOf(
                        clientAcc1.address
                    );

                    let sellerInitialReceivingTokenBalance =
                        await tokenB.balanceOf(clientAcc2.address);
                    let sellerInitialSellingTokenBalance =
                        await tokenA.balanceOf(clientAcc2.address);

                    let dexInitialSellingTokenBalance = await tokenA.balanceOf(
                        dex.address
                    );
                    let dexInitialReceivingTokenBalance =
                        await tokenB.balanceOf(dex.address);

                    let buyerShouldBeLocked = calcBuyerLockAmount(
                        buyAmount,
                        limitPrice,
                        true
                    );

                    let buyerShouldBeSpent = calcBuyerSpentAmount(
                        sellAmount,
                        buyAmount,
                        limitPrice,
                        false,
                        false,
                        false
                    );

                    let buyerShouldBeFee = calcFeeAmount(buyerShouldBeLocked);

                    let sellerShouldBeLocked = sellAmount;
                    let sellerShouldBeSpent = calcSellerSpentAmount(
                        sellAmount,
                        buyAmount,
                        limitPrice,
                        false,
                        true,
                        true
                    );
                    let sellerShouldBeFee = calcFeeAmount(sellerShouldBeLocked);

                    // matchedOrder
                    // ID3
                    await dex
                        .connect(clientAcc1)
                        .buyLimit(
                            tokenA.address,
                            tokenB.address,
                            buyAmount,
                            limitPrice
                        );

                    // initOrder
                    // ID4
                    await dex
                        .connect(clientAcc2)
                        .sellLimit(
                            tokenB.address,
                            tokenA.address,
                            sellAmount,
                            limitPrice
                        );

                    let signatureMatch = await hashAndSignMatch(
                        dex.address,
                        4,
                        [3],
                        nonce
                    );

                    await expect(dex.matchOrders(4, [3], nonce, signatureMatch))
                        .to.emit(dex, "OrdersMatched")
                        .withArgs(4, 3);

                    let buyerEndReceivingTokenBalance = await tokenA.balanceOf(
                        clientAcc1.address
                    );

                    let buyerEndPayingTokenBalance = await tokenB.balanceOf(
                        clientAcc1.address
                    );

                    let sellerEndReceivingTokenBalance = await tokenB.balanceOf(
                        clientAcc2.address
                    );
                    let sellerEndSellingTokenBalance = await tokenA.balanceOf(
                        clientAcc2.address
                    );

                    let dexEndSellingTokenBalance = await tokenA.balanceOf(
                        dex.address
                    );
                    let dexEndReceivingTokenBalance = await tokenB.balanceOf(
                        dex.address
                    );
                    // Seller locks all his tokens and pays fee
                    expect(
                        sellerInitialSellingTokenBalance.sub(
                            sellerEndSellingTokenBalance
                        )
                    ).to.eq(sellerShouldBeLocked.add(sellerShouldBeFee));
                    // Buyer receives part of sold tokens
                    expect(
                        buyerEndReceivingTokenBalance.sub(
                            buyerInitialReceivingTokenBalance
                        )
                    ).to.eq(buyAmount);
                    // Buyer pays for purchased tokens:
                    expect(
                        buyerInitialPayingTokenBalance.sub(
                            buyerEndPayingTokenBalance
                        )
                    ).to.eq(buyerShouldBeLocked.add(buyerShouldBeFee));
                    // Seller receives payment for sold tokens
                    expect(
                        sellerEndReceivingTokenBalance.sub(
                            sellerInitialReceivingTokenBalance
                        )
                    ).to.eq(buyerShouldBeSpent);

                    let initOrder = await dex.getOrder(4);
                    let initOrderAmount = initOrder[3];
                    let initOrderAmountFilled = initOrder[4];
                    let initOrderAmountLocked = initOrder[10];
                    let initOrderStatus = initOrder[11];

                    let matchedOrder = await dex.getOrder(3);
                    let matchedOrderAmount = matchedOrder[3];
                    let matchedOrderAmountFilled = matchedOrder[4];
                    let matchedOrderAmountLocked = matchedOrder[10];
                    let matchedOrderStatus = matchedOrder[11];

                    // Buy order should be closed
                    expect(matchedOrderAmountFilled).to.eq(matchedOrderAmount);
                    expect(matchedOrderStatus).to.eq(2);

                    // Whole lock of buy order should be spent
                    expect(matchedOrderAmountLocked).to.eq(0);
                    // Half of lock of sell order should be left
                    expect(initOrderAmountLocked).to.eq(
                        sellerShouldBeLocked.sub(sellerShouldBeSpent)
                    );

                    // Only fee from buy order should be left
                    expect(
                        dexEndReceivingTokenBalance.sub(
                            dexInitialReceivingTokenBalance
                        )
                    ).to.eq(buyerShouldBeFee);
                    // Fee and some locked amount should be left from sell order
                    expect(
                        dexEndSellingTokenBalance.sub(
                            dexInitialSellingTokenBalance
                        )
                    ).to.eq(
                        sellerShouldBeLocked
                            .sub(sellerShouldBeSpent)
                            .add(sellerShouldBeFee)
                    );
                });

                it("Should match smaller sell order with greater buy order when sell order tokenA is quoted", async () => {
                    let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                        deploysQuotedB
                    );

                    let mintAmount = parseEther("1000000");
                    let sellAmount = parseEther("10");
                    // Buyer is ready to buy twice as much
                    let buyAmount = sellAmount.mul(2);
                    let limitPrice = parseEther("1.5");
                    let nonce = 777;

                    // Mint some tokens to pay for purchase
                    await tokenA.mint(clientAcc1.address, mintAmount);
                    await tokenA
                        .connect(clientAcc1)
                        .approve(dex.address, mintAmount);

                    // Mint some tokens to sell
                    await tokenB.mint(clientAcc2.address, mintAmount);
                    await tokenB
                        .connect(clientAcc2)
                        .approve(dex.address, mintAmount);

                    await tokenA
                        .connect(ownerAcc)
                        .approve(dex.address, mintAmount);

                    await tokenB
                        .connect(ownerAcc)
                        .approve(dex.address, mintAmount);

                    let buyerInitialPayingTokenBalance = await tokenA.balanceOf(
                        clientAcc1.address
                    );
                    let buyerInitialReceivingTokenBalance =
                        await tokenB.balanceOf(clientAcc1.address);

                    let sellerInitialSellingTokenBalance =
                        await tokenB.balanceOf(clientAcc2.address);
                    let sellerInitialReceivingTokenBalance =
                        await tokenA.balanceOf(clientAcc2.address);

                    let dexInitialSellingTokenBalance = await tokenB.balanceOf(
                        dex.address
                    );
                    let dexInitialReceivingTokenBalance =
                        await tokenA.balanceOf(dex.address);

                    let buyerShouldBeLocked = calcBuyerLockAmount(
                        buyAmount,
                        limitPrice,
                        false
                    );
                    let buyerShouldBeSpent = calcBuyerSpentAmount(
                        sellAmount,
                        buyAmount,
                        limitPrice,
                        true,
                        true,
                        false
                    );

                    let buyerShouldBeFee = calcFeeAmount(buyerShouldBeLocked);

                    let sellerShouldBeLocked = sellAmount;
                    let sellerShouldBeSpent = calcSellerSpentAmount(
                        sellAmount,
                        buyAmount,
                        limitPrice,
                        true,
                        false,
                        true
                    );
                    let sellerShouldBeFee = calcFeeAmount(sellerShouldBeLocked);

                    // matchedOrder
                    // ID3
                    await dex
                        .connect(clientAcc1)
                        .buyLimit(
                            tokenB.address,
                            tokenA.address,
                            buyAmount,
                            limitPrice
                        );

                    // initOrder
                    // ID4
                    await dex
                        .connect(clientAcc2)
                        .sellLimit(
                            tokenA.address,
                            tokenB.address,
                            sellAmount,
                            limitPrice
                        );

                    let signatureMatch = await hashAndSignMatch(
                        dex.address,
                        4,
                        [3],
                        nonce
                    );

                    await expect(dex.matchOrders(4, [3], nonce, signatureMatch))
                        .to.emit(dex, "OrdersMatched")
                        .withArgs(4, 3);

                    let buyerEndPayingTokenBalance = await tokenA.balanceOf(
                        clientAcc1.address
                    );
                    let buyerEndReceivingTokenBalance = await tokenB.balanceOf(
                        clientAcc1.address
                    );

                    let sellerEndSellingTokenBalance = await tokenB.balanceOf(
                        clientAcc2.address
                    );
                    let sellerEndReceivingTokenBalance = await tokenA.balanceOf(
                        clientAcc2.address
                    );

                    let dexEndSellingTokenBalance = await tokenB.balanceOf(
                        dex.address
                    );
                    let dexEndReceivingTokenBalance = await tokenA.balanceOf(
                        dex.address
                    );

                    // Seller locks all his tokens and pays fee
                    expect(
                        sellerInitialSellingTokenBalance.sub(
                            sellerEndSellingTokenBalance
                        )
                    ).to.eq(sellerShouldBeLocked.add(sellerShouldBeFee));
                    // Buyer receives all sold tokens
                    expect(
                        buyerEndReceivingTokenBalance.sub(
                            buyerInitialReceivingTokenBalance
                        )
                    ).to.eq(sellerShouldBeLocked);
                    // Buyer locks all his tokens and pays fee
                    expect(
                        buyerInitialPayingTokenBalance.sub(
                            buyerEndPayingTokenBalance
                        )
                    ).to.eq(buyerShouldBeLocked.add(buyerShouldBeFee));
                    // Seller receives payment for sold tokens
                    expect(
                        sellerEndReceivingTokenBalance.sub(
                            sellerInitialReceivingTokenBalance
                        )
                    ).to.eq(buyerShouldBeSpent);

                    let initOrder = await dex.getOrder(4);
                    let initOrderAmount = initOrder[3];
                    let initOrderAmountFilled = initOrder[4];
                    let initOrderAmountLocked = initOrder[10];
                    let initOrderStatus = initOrder[11];

                    let matchedOrder = await dex.getOrder(3);
                    let matchedOrderAmount = matchedOrder[3];
                    let matchedOrderAmountFilled = matchedOrder[4];
                    let matchedOrderAmountLocked = matchedOrder[10];
                    let matchedOrderStatus = matchedOrder[11];

                    // Sell order should be closed
                    expect(initOrderAmountFilled).to.eq(initOrderAmount);
                    expect(initOrderStatus).to.eq(2);

                    // Whole lock of sell order should be spent
                    expect(initOrderAmountLocked).to.eq(0);
                    // Half of lock of buy order should be left
                    expect(matchedOrderAmountLocked).to.eq(
                        buyerShouldBeLocked.sub(buyerShouldBeSpent)
                    );

                    // Only fee from sell order should be left
                    expect(
                        dexEndSellingTokenBalance.sub(
                            dexInitialSellingTokenBalance
                        )
                    ).to.eq(sellerShouldBeFee);
                    // Fee and some locked amount should be left from buy order
                    expect(
                        dexEndReceivingTokenBalance.sub(
                            dexInitialReceivingTokenBalance
                        )
                    ).to.eq(
                        buyerShouldBeLocked
                            .sub(buyerShouldBeSpent)
                            .add(buyerShouldBeFee)
                    );
                });
            });
        });
    });

    // #WF
    describe("Withdraw fees", () => {
        // #WFP
        describe("Part of fees", () => {
            it("Should withdraw fees in two tokens", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                let mintAmount = parseEther("1000000");
                let sellAmount = parseEther("10");
                let buyAmount = sellAmount;
                let slippage = 10;
                let limitPrice = parseEther("1.5");
                let nonce = 777;

                // Mint some tokens to sell
                await tokenB.mint(clientAcc1.address, mintAmount);
                await tokenB
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);

                // Mint some tokens to pay for purchase
                await tokenA.mint(clientAcc2.address, mintAmount);
                await tokenA
                    .connect(clientAcc2)
                    .approve(dex.address, mintAmount);

                // Fees in tokenB
                await dex
                    .connect(clientAcc1)
                    .sellLimit(
                        tokenA.address,
                        tokenB.address,
                        sellAmount,
                        limitPrice
                    );

                let signatureMarket = await hashAndSignMarket(
                    dex.address,
                    tokenB.address,
                    tokenA.address,
                    buyAmount,
                    slippage,
                    nonce
                );

                // Fees in tokenA
                await dex
                    .connect(clientAcc2)
                    .buyMarket(
                        tokenB.address,
                        tokenA.address,
                        buyAmount,
                        slippage,
                        nonce,
                        signatureMarket
                    );

                let signatureMatch = await hashAndSignMatch(
                    dex.address,
                    4,
                    [3],
                    nonce
                );

                await dex.matchOrders(4, [3], nonce, signatureMatch);

                // Fee rate is 0.1% of lock amount

                let sellerShouldBeLocked = sellAmount;
                // Fee in tokenB
                let sellerShouldBeFee = calcFeeAmount(sellerShouldBeLocked);
                let buyerShouldBeLocked = calcBuyerLockAmount(
                    buyAmount,
                    limitPrice,
                    false
                );
                // Fee in tokenA
                let buyerShouldBeFee = calcFeeAmount(buyerShouldBeLocked);

                let initialOwnerTokenABalance = await tokenA.balanceOf(
                    ownerAcc.address
                );
                let initialOwnerTokenBBalance = await tokenB.balanceOf(
                    ownerAcc.address
                );

                // After all orders have been closed, fees can be withdrawn
                let tokensToWithdraw = [tokenB.address, tokenA.address];
                await expect(
                    dex.connect(ownerAcc).withdrawFees(tokensToWithdraw)
                ).to.emit(dex, "FeesWithdrawn");

                let endOwnerTokenABalance = await tokenA.balanceOf(
                    ownerAcc.address
                );
                let endOwnerTokenBBalance = await tokenB.balanceOf(
                    ownerAcc.address
                );

                // Balances in both tokens should increase by fee amounts
                expect(
                    endOwnerTokenABalance.sub(initialOwnerTokenABalance)
                ).to.equal(buyerShouldBeFee);

                expect(
                    endOwnerTokenBBalance.sub(initialOwnerTokenBBalance)
                ).to.equal(sellerShouldBeFee);
            });
        });
        // #WFA
        describe("All fees", () => {
            it("Should withdraw fees in all tokens", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                let mintAmount = parseEther("1000000");
                let sellAmount = parseEther("10");
                let buyAmount = sellAmount;
                let slippage = 10;
                let limitPrice = parseEther("1.5");
                let nonce = 777;

                // Mint some tokens to sell
                await tokenB.mint(clientAcc1.address, mintAmount);
                await tokenB
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);

                // Mint some tokens to pay for purchase
                await tokenA.mint(clientAcc2.address, mintAmount);
                await tokenA
                    .connect(clientAcc2)
                    .approve(dex.address, mintAmount);

                // Fees in tokenB
                await dex
                    .connect(clientAcc1)
                    .sellLimit(
                        tokenA.address,
                        tokenB.address,
                        sellAmount,
                        limitPrice
                    );

                let signatureMarket = await hashAndSignMarket(
                    dex.address,
                    tokenB.address,
                    tokenA.address,
                    buyAmount,
                    slippage,
                    nonce
                );

                // Fees in tokenA
                await dex
                    .connect(clientAcc2)
                    .buyMarket(
                        tokenB.address,
                        tokenA.address,
                        buyAmount,
                        slippage,
                        nonce,
                        signatureMarket
                    );

                let signatureMatch = await hashAndSignMatch(
                    dex.address,
                    4,
                    [3],
                    nonce
                );

                await dex.matchOrders(4, [3], nonce, signatureMatch);

                // Fee rate is 0.1% of lock amount

                let sellerShouldBeLocked = sellAmount;
                // Fee in tokenB
                let sellerShouldBeFee = calcFeeAmount(sellerShouldBeLocked);
                let buyerShouldBeLocked = calcBuyerLockAmount(
                    buyAmount,
                    limitPrice,
                    false
                );
                // Fee in tokenA
                let buyerShouldBeFee = calcFeeAmount(buyerShouldBeLocked);

                let initialOwnerTokenABalance = await tokenA.balanceOf(
                    ownerAcc.address
                );
                let initialOwnerTokenBBalance = await tokenB.balanceOf(
                    ownerAcc.address
                );

                // After all orders have been closed, fees can be withdrawn
                await expect(dex.connect(ownerAcc).withdrawAllFees()).to.emit(
                    dex,
                    "FeesWithdrawn"
                );

                let endOwnerTokenABalance = await tokenA.balanceOf(
                    ownerAcc.address
                );
                let endOwnerTokenBBalance = await tokenB.balanceOf(
                    ownerAcc.address
                );

                // Balances in both tokens should increase by fee amounts
                expect(
                    endOwnerTokenABalance.sub(initialOwnerTokenABalance)
                ).to.equal(buyerShouldBeFee);

                expect(
                    endOwnerTokenBBalance.sub(initialOwnerTokenBBalance)
                ).to.equal(sellerShouldBeFee);
            });

            it("Should withdraw fees with native tokens", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysQuotedB
                );

                // Create a pair with native tokens
                let limitPriceForNative = parseEther("1.5");
                let sellAmountNative = parseEther("4");
                let feeRate = await dex.feeRate();
                let feeNative = sellAmountNative.mul(feeRate).div(10000);
                let totalLockNative = sellAmountNative.add(feeNative);
                await dex
                    .connect(ownerAcc)
                    .startSaleSingle(
                        tokenA.address,
                        zeroAddress,
                        sellAmountNative,
                        limitPriceForNative,
                        { value: totalLockNative }
                    );

                let mintAmount = parseEther("1000000");
                let sellAmount = parseEther("10");
                let buyAmount = sellAmount;
                let slippage = 10;
                let limitPrice = parseEther("1.5");
                let nonce = 777;

                // Mint some tokens to pay for purchase
                await tokenA.mint(clientAcc1.address, mintAmount);
                await tokenA
                    .connect(clientAcc1)
                    .approve(dex.address, mintAmount);

                let buyerShouldBeLocked = calcBuyerLockAmount(
                    buyAmount,
                    limitPrice,
                    true
                );
                let buyerShouldBeFee = calcFeeAmount(buyerShouldBeLocked);

                // Fees in tokenB
                await dex
                    .connect(clientAcc1)
                    .sellLimit(
                        zeroAddress,
                        tokenA.address,
                        sellAmount,
                        limitPrice
                    );

                let signatureMarket = await hashAndSignMarket(
                    dex.address,
                    tokenA.address,
                    zeroAddress,
                    buyAmount,
                    slippage,
                    nonce
                );

                // Fees in tokenA
                await dex
                    .connect(clientAcc2)
                    .buyMarket(
                        tokenA.address,
                        zeroAddress,
                        buyAmount,
                        slippage,
                        nonce,
                        signatureMarket,
                        { value: buyerShouldBeLocked.add(buyerShouldBeFee) }
                    );

                let signatureMatch = await hashAndSignMatch(
                    dex.address,
                    5,
                    [4],
                    nonce
                );

                await dex.matchOrders(5, [4], nonce, signatureMatch);

                // Fee rate is 0.1% of lock amount

                let sellerShouldBeLocked = await dex.getLockAmount(
                    zeroAddress,
                    tokenA.address,
                    sellAmount,
                    limitPrice,
                    1,
                    1
                );
                // Fee in tokenB
                let sellerShouldBeFee = calcFeeAmount(sellerShouldBeLocked);

                let initialOwnerTokenABalance = await tokenA.balanceOf(
                    ownerAcc.address
                );
                let initialOwnerTokenNativeBalance = await getBalance(
                    ownerAcc.address
                );

                // Estimate gas
                let gasAmount = await dex.connect(ownerAcc).estimateGas.withdrawAllFees();
                let payForGas = gasAmount.mul(await ethers.provider.getGasPrice());

                // After all orders have been closed, fees can be withdrawn
                await expect(dex.connect(ownerAcc).withdrawAllFees()).to.emit(
                    dex,
                    "FeesWithdrawn"
                );

                let endOwnerTokenABalance = await tokenA.balanceOf(
                    ownerAcc.address
                );
                let endOwnerTokenNativeBalance = await getBalance(
                    ownerAcc.address
                );

                // Balances in both tokens should increase by fee amounts
                expect(
                    endOwnerTokenABalance.sub(initialOwnerTokenABalance)
                ).to.equal(sellerShouldBeFee);

                expect(
                    endOwnerTokenNativeBalance.sub(initialOwnerTokenNativeBalance)
                ).to.closeTo(buyerShouldBeFee.sub(payForGas), "200000000000000");
            });
        });

        // #WFR
        describe("Reverts", () => {
            it("Should fail to withdraw all fees(no fees)", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploysNoQuoted
                );

                let dexTx2 = await ethers.getContractFactory("BentureDex");
                let dex2 = await dexTx2.deploy();
                await dex2.deployed();

                await dex2.setAdminToken(adminToken.address);

                await expect(
                    dex2.connect(ownerAcc).withdrawAllFees()
                ).to.be.revertedWithCustomError(dex2, "NoFeesToWithdraw");
            });
        });
    });

    // #N
    describe("Native tokens operations", () => {
        it("Should create orders with native tokens", async () => {
            let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                deploysQuotedB
            );

            // Create a pair with native tokens
            let limitPriceForNative = parseEther("1.5");
            let sellAmountNative = parseEther("4");
            let feeRate = await dex.feeRate();
            let feeNative = sellAmountNative.mul(feeRate).div(10000);
            let totalLockNative = sellAmountNative.add(feeNative);
            await dex
                .connect(ownerAcc)
                .startSaleSingle(
                    tokenA.address,
                    zeroAddress,
                    sellAmountNative,
                    limitPriceForNative,
                    { value: totalLockNative }
                );

            let buyAmount = parseEther("10");
            let limitPrice = parseEther("1.5");
            let lockAmountNative = await dex.getLockAmount(
                tokenA.address,
                zeroAddress,
                buyAmount,
                limitPrice,
                1,
                0
            );
            let fee = lockAmountNative.mul(feeRate).div(10000);
            let totalLock = lockAmountNative.add(fee);
            // Send some native tokens to the client
            let tx = {
                to: clientAcc1.address,
                value: parseEther("5"),
                gasLimit: 30000,
            };
            await ownerAcc.sendTransaction(tx);
            let startClientBalance = await getBalance(clientAcc1.address);
            let startDexBalance = await getBalance(dex.address);

            await expect(
                dex
                    .connect(clientAcc1)
                    .buyLimit(
                        tokenA.address,
                        zeroAddress,
                        buyAmount,
                        limitPrice,
                        { value: totalLock }
                    )
            )
                .to.emit(dex, "OrderCreated")
                .withArgs(
                    4,
                    clientAcc1.address,
                    tokenA.address,
                    zeroAddress,
                    buyAmount,
                    1,
                    0,
                    limitPrice,
                    true
                );

            let endClientBalance = await getBalance(clientAcc1.address);
            let endDexBalance = await getBalance(dex.address);

            // Pair price should have udpated
            let [quotedToken, pairPrice] = await dex.getPrice(
                tokenA.address,
                zeroAddress
            );
            expect(pairPrice).to.eq(limitPrice);

            let shouldBeLocked = calcBuyerLockAmount(
                buyAmount,
                limitPrice,
                true
            );
            let shouldBeFee = calcFeeAmount(shouldBeLocked);

            // Client pays lock amount + fee + gas
            expect(startClientBalance.sub(endClientBalance)).to.be.gt(
                shouldBeLocked.add(shouldBeFee)
            );
            expect(endDexBalance.sub(startDexBalance)).to.eq(
                shouldBeLocked.add(shouldBeFee)
            );

            // Check that order was really created
            let order = await dex.getOrder(4);

            let user = order[0];
            let firstToken = order[1];
            let secondToken = order[2];
            let amount = order[3];
            let amountFilled = order[4];
            let type = order[5];
            let side = order[6];
            let price = order[7];
            let isCancellable = order[8];
            let feeAmount = order[9];
            let lockedAmount = order[10];
            let status = order[11];

            expect(user).to.eq(clientAcc1.address);
            expect(firstToken).to.eq(tokenA.address);
            expect(secondToken).to.eq(zeroAddress);
            expect(amount).to.eq(buyAmount);
            expect(amountFilled).to.eq(0);
            expect(type).to.eq(1);
            expect(side).to.eq(0);
            expect(price).to.eq(limitPrice);
            expect(isCancellable).to.eq(true);
            expect(feeAmount).to.eq(shouldBeFee);
            expect(lockedAmount).to.eq(shouldBeLocked);
            expect(status).to.eq(0);
        });
        it("Should fail to create orders with native tokens", async () => {
            let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                deploysQuotedB
            );

            // Create a pair with native tokens
            let limitPriceForNative = parseEther("1.5");
            let sellAmountNative = parseEther("4");
            let feeRate = await dex.feeRate();
            let feeNative = sellAmountNative.mul(feeRate).div(10000);
            let totalLockNative = sellAmountNative.add(feeNative);
            await dex
                .connect(ownerAcc)
                .startSaleSingle(
                    tokenA.address,
                    zeroAddress,
                    sellAmountNative,
                    limitPriceForNative,
                    { value: totalLockNative }
                );

            let buyAmount = parseEther("10");
            let limitPrice = parseEther("1.5");
            let lockAmountNative = await dex.getLockAmount(
                tokenA.address,
                zeroAddress,
                buyAmount,
                limitPrice,
                1,
                0
            );

            await expect(
                dex
                    .connect(clientAcc1)
                    .buyLimit(
                        tokenA.address,
                        zeroAddress,
                        buyAmount,
                        limitPrice,
                        { value: 0 }
                    )
            ).to.be.revertedWithCustomError(dex, "NotEnoughNativeTokens");
        });
        it("Should cancel orders with native tokens", async () => {
            let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                deploysQuotedB
            );

            // Create a pair with native tokens
            let limitPriceForNative = parseEther("1.5");
            let sellAmountNative = parseEther("4");
            let feeRate = await dex.feeRate();
            let feeNative = sellAmountNative.mul(feeRate).div(10000);
            let totalLockNative = sellAmountNative.add(feeNative);
            await dex
                .connect(ownerAcc)
                .startSaleSingle(
                    tokenA.address,
                    zeroAddress,
                    sellAmountNative,
                    limitPriceForNative,
                    { value: totalLockNative }
                );

            let buyAmount = parseEther("10");
            let limitPrice = parseEther("1.5");
            let mintAmount = parseEther("1000000");
            // Send some native tokens to the client
            let tx = {
                to: clientAcc1.address,
                value: parseEther("5"),
                gasLimit: 30000,
            };
            await ownerAcc.sendTransaction(tx);
            let lockAmountNative = await dex.getLockAmount(
                tokenA.address,
                zeroAddress,
                buyAmount,
                limitPrice,
                1,
                0
            );
            let fee = lockAmountNative.mul(feeRate).div(10000);
            let totalLock = lockAmountNative.add(fee);
            let shouldBeFee = calcFeeAmount(totalLock);

            await tokenA.mint(clientAcc1.address, mintAmount);
            await tokenB.mint(clientAcc1.address, mintAmount);
            await tokenA.connect(clientAcc1).approve(dex.address, mintAmount);
            await tokenB.connect(clientAcc1).approve(dex.address, mintAmount);

            await dex
                .connect(clientAcc1)
                .buyLimit(tokenA.address, zeroAddress, buyAmount, limitPrice, {
                    value: totalLock,
                });

            let startClientBalance = await getBalance(clientAcc1.address);

            let order = await dex.getOrder(4);
            let status = order[11];
            expect(status).to.eq(0);

            await expect(dex.connect(clientAcc1).cancelOrder(4))
                .to.emit(dex, "OrderCancelled")
                .withArgs(4);

            let endClientBalance = await getBalance(clientAcc1.address);

            // Whole lock and fee should be returned to the user
            // User also pays for gas
            expect(endClientBalance.sub(startClientBalance)).to.be.lt(
                totalLock.add(shouldBeFee)
            );

            // Order status should change
            order = await dex.getOrder(4);
            status = order[11];
            expect(status).to.eq(3);
        });
        it("Should match orders with native tokens", async () => {
            let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                deploysQuotedB
            );

            // Create a pair with native tokens
            let limitPriceForNative = parseEther("1.5");
            let sellAmountNative = parseEther("4");
            let feeRate = await dex.feeRate();
            let feeNative = sellAmountNative.mul(feeRate).div(10000);
            let totalLockNative = sellAmountNative.add(feeNative);
            await dex
                .connect(ownerAcc)
                .startSaleSingle(
                    tokenA.address,
                    zeroAddress,
                    sellAmountNative,
                    limitPriceForNative,
                    { value: totalLockNative }
                );

            let mintAmount = parseEther("1000000");
            let sellAmount = parseEther("5");
            let buyAmount = sellAmount;
            let limitPrice = parseEther("1.5");
            let nonce = 777;

            // Mint some tokens to sell
            await tokenB.mint(clientAcc1.address, mintAmount);
            await tokenB.connect(clientAcc1).approve(dex.address, mintAmount);

            // Send some native tokens to pay for purchase
            await tokenA.mint(clientAcc2.address, mintAmount);
            await tokenA.connect(clientAcc2).approve(dex.address, mintAmount);

            // Balances in both tokens of both users
            let sellerInitialSellingTokenBalance = await getBalance(
                clientAcc1.address
            );
            let sellerInitialReceivingTokenBalance = await tokenA.balanceOf(
                clientAcc1.address
            );

            let buyerInitialPayingTokenBalance = await tokenA.balanceOf(
                clientAcc2.address
            );
            let buyerInitialReceivingTokenBalance = await getBalance(
                clientAcc2.address
            );

            let dexInitialSellingTokenBalance = await getBalance(dex.address);
            let dexInitialReceivingTokenBalance = await tokenA.balanceOf(
                dex.address
            );

            let sellerShouldBeLocked = await dex.getLockAmount(
                tokenA.address,
                zeroAddress,
                sellAmount,
                limitPrice,
                1,
                1
            );
            let sellerShouldBeFee = calcFeeAmount(sellerShouldBeLocked);

            let buyerShouldBeLocked = calcBuyerLockAmount(
                buyAmount,
                limitPrice.div(2),
                false
            );
            let buyerShouldBeSpent = calcBuyerSpentAmount(
                buyAmount,
                sellAmount,
                limitPrice.div(2),
                false,
                false,
                true
            );
            let buyerShouldBeFee = calcFeeAmount(buyerShouldBeLocked);

            // matchedOrder
            await dex
                .connect(clientAcc1)
                .sellLimit(
                    tokenA.address,
                    zeroAddress,
                    sellAmount,
                    limitPrice,
                    { value: sellerShouldBeLocked.add(sellerShouldBeFee) }
                );

            // initOrder
            await dex
                .connect(clientAcc2)
                .buyLimit(
                    zeroAddress,
                    tokenA.address,
                    buyAmount,
                    limitPrice.div(2)
                );

            let [, pairInitialPrice] = await dex.getPrice(
                tokenA.address,
                zeroAddress
            );

            let signatureMatch = await hashAndSignMatch(
                dex.address,
                5,
                [4],
                777
            );

            await expect(dex.matchOrders(5, [4], nonce, signatureMatch))
                .to.emit(dex, "OrdersMatched")
                .withArgs(5, 4);

            let sellerEndSellingTokenBalance = await getBalance(
                clientAcc1.address
            );
            let sellerEndReceivingTokenBalance = await tokenA.balanceOf(
                clientAcc1.address
            );

            let buyerEndPayingTokenBalance = await tokenA.balanceOf(
                clientAcc2.address
            );
            let buyerEndReceivingTokenBalance = await getBalance(
                clientAcc2.address
            );

            let dexEndSellingTokenBalance = await getBalance(dex.address);
            let dexEndReceivingTokenBalance = await tokenA.balanceOf(
                dex.address
            );

            let [, pairEndPrice] = await dex.getPrice(
                tokenA.address,
                zeroAddress
            );

            // Pair price should decrease 2 times
            expect(pairEndPrice).to.eq(pairInitialPrice.div(2));

            // Seller sells whole selling amount and pays fee
            // Seller also pays for gas
            expect(
                sellerInitialSellingTokenBalance.sub(
                    sellerEndSellingTokenBalance
                )
            ).to.gt(sellAmount.add(sellerShouldBeFee));
            // Buyer receives all sold tokens
            // Buyer also pays for gas for his order creation
            expect(
                buyerEndReceivingTokenBalance.sub(
                    buyerInitialReceivingTokenBalance
                )
            ).to.be.lt(sellAmount);
            // Buyer locks all paying tokens and pays fee
            expect(
                buyerInitialPayingTokenBalance.sub(buyerEndPayingTokenBalance)
            ).to.eq(buyerShouldBeLocked.add(buyerShouldBeFee));
            // Seller receives payment for sold tokens
            expect(
                sellerEndReceivingTokenBalance.sub(
                    sellerInitialReceivingTokenBalance
                )
            ).to.eq(buyerShouldBeSpent);

            // Both orders had the same amount so they both
            // have to be filled
            let initOrder = await dex.getOrder(5);
            let initOrderAmount = initOrder[3];
            let initOrderAmountFilled = initOrder[4];
            let initOrderAmountLocked = initOrder[10];
            let initOrderStatus = initOrder[11];

            let matchedOrder = await dex.getOrder(4);
            let matchedOrderAmount = matchedOrder[3];
            let matchedOrderAmountFilled = matchedOrder[4];
            let matchedOrderAmountLocked = matchedOrder[10];
            let matchedOrderStatus = matchedOrder[11];

            // Both orders should have a `Closed` status
            expect(initOrderAmountFilled).to.eq(initOrderAmount);
            expect(initOrderStatus).to.eq(2);

            expect(matchedOrderAmountFilled).to.eq(matchedOrderAmount);
            expect(matchedOrderStatus).to.eq(2);

            // Whole lock of sell order should be spent
            expect(matchedOrderAmountLocked).to.eq(0);

            // Half of lock of buy order should be left
            expect(initOrderAmountLocked).to.eq(
                buyerShouldBeLocked.sub(buyerShouldBeSpent)
            );

            // Only fee from sell order should be left on dex balance
            expect(
                dexEndSellingTokenBalance.sub(dexInitialSellingTokenBalance)
            ).to.eq(sellerShouldBeFee);
            // Fee and some part of lock of buy order should be left on dex balance
            expect(
                dexEndReceivingTokenBalance.sub(dexInitialReceivingTokenBalance)
            ).to.eq(
                buyerShouldBeFee
                    .add(buyerShouldBeLocked)
                    .sub(buyerShouldBeSpent)
            );
        });

        it("Should match orders with native tokens 2", async () => {
            let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                deploysQuotedB
            );

            // Create a pair with native tokens
            let limitPriceForNative = parseEther("1.5");
            let sellAmountNative = parseEther("4");
            let feeRate = await dex.feeRate();
            let feeNative = sellAmountNative.mul(feeRate).div(10000);
            let totalLockNative = sellAmountNative.add(feeNative);
            await dex
                .connect(ownerAcc)
                .startSaleSingle(
                    tokenA.address,
                    zeroAddress,
                    sellAmountNative,
                    limitPriceForNative,
                    { value: totalLockNative }
                );

            let mintAmount = parseEther("1000000");
            let sellAmount = parseEther("5");
            let buyAmount = sellAmount;
            let limitPrice = parseEther("1.5");
            let nonce = 777;

            // Send some native tokens to sell
            await tokenA.mint(clientAcc1.address, mintAmount);
            await tokenA.connect(clientAcc1).approve(dex.address, mintAmount);

            // Balances in both tokens of both users
            let sellerInitialReceivingTokenBalance = await getBalance(
                clientAcc1.address
            );
            let sellerInitialSellingTokenBalance = await tokenA.balanceOf(
                clientAcc1.address
            );

            let buyerInitialReceivingTokenBalance = await tokenA.balanceOf(
                clientAcc2.address
            );
            let buyerInitialPayingTokenBalance = await getBalance(
                clientAcc2.address
            );

            let dexInitialReceivingTokenBalance = await getBalance(dex.address);
            let dexInitialSellingTokenBalance = await tokenA.balanceOf(
                dex.address
            );

            let sellerShouldBeLocked = await dex.getLockAmount(
                zeroAddress,
                tokenA.address,
                sellAmount,
                limitPrice,
                1,
                1
            );
            let sellerShouldBeFee = calcFeeAmount(sellerShouldBeLocked);

            let buyerShouldBeLocked = calcBuyerLockAmount(
                buyAmount,
                limitPrice.div(2),
                true
            );
            let buyerShouldBeSpent = calcBuyerSpentAmount(
                buyAmount,
                sellAmount,
                limitPrice.div(2),
                true,
                false,
                true
            );
            let buyerShouldBeFee = calcFeeAmount(buyerShouldBeLocked);

            // matchedOrder
            await dex
                .connect(clientAcc1)
                .sellLimit(
                    zeroAddress,
                    tokenA.address,
                    sellAmount,
                    limitPrice
                );

            // initOrder
            await dex
                .connect(clientAcc2)
                .buyLimit(
                    tokenA.address,
                    zeroAddress,
                    buyAmount,
                    limitPrice.div(2),
                    { value: buyerShouldBeLocked.add(buyerShouldBeFee) }
                );

            let [, pairInitialPrice] = await dex.getPrice(
                zeroAddress,
                tokenA.address
            );

            let signatureMatch = await hashAndSignMatch(
                dex.address,
                5,
                [4],
                777
            );

            await expect(dex.matchOrders(5, [4], nonce, signatureMatch))
                .to.emit(dex, "OrdersMatched")
                .withArgs(5, 4);

            let sellerEndReceivingTokenBalance = await getBalance(
                clientAcc1.address
            );
            let sellerEndSellingTokenBalance = await tokenA.balanceOf(
                clientAcc1.address
            );

            let buyerEndReceivingTokenBalance = await tokenA.balanceOf(
                clientAcc2.address
            );
            let buyerEndPayingTokenBalance = await getBalance(
                clientAcc2.address
            );

            let dexEndReceivingTokenBalance = await getBalance(dex.address);
            let dexEndSellingTokenBalance = await tokenA.balanceOf(
                dex.address
            );

            let [, pairEndPrice] = await dex.getPrice(
                zeroAddress,
                tokenA.address
            );

            // Pair price should decrease 2 times
            expect(pairEndPrice).to.eq(pairInitialPrice.div(2));

            // Seller sells whole selling amount and pays fee
            // Seller also pays for gas
            expect(
                sellerInitialSellingTokenBalance.sub(
                    sellerEndSellingTokenBalance
                )
            ).to.closeTo(sellAmount.add(sellerShouldBeFee), 10000);
            // Buyer receives all sold tokens
            expect(
                buyerEndReceivingTokenBalance.sub(
                    buyerInitialReceivingTokenBalance
                )
            ).to.be.closeTo(sellAmount, 10000);
            // Buyer locks all paying tokens and pays fee
            // Buyer also pays for gas for his order creation
            expect(
                buyerInitialPayingTokenBalance.sub(buyerEndPayingTokenBalance)
            ).to.gt(buyerShouldBeLocked.add(buyerShouldBeFee));
            // Seller receives payment for sold tokens
            expect(
                sellerEndReceivingTokenBalance.sub(
                    sellerInitialReceivingTokenBalance
                )
            ).to.lt(buyerShouldBeSpent);

            // Both orders had the same amount so they both
            // have to be filled
            let initOrder = await dex.getOrder(5);
            let initOrderAmount = initOrder[3];
            let initOrderAmountFilled = initOrder[4];
            let initOrderAmountLocked = initOrder[10];
            let initOrderStatus = initOrder[11];

            let matchedOrder = await dex.getOrder(4);
            let matchedOrderAmount = matchedOrder[3];
            let matchedOrderAmountFilled = matchedOrder[4];
            let matchedOrderAmountLocked = matchedOrder[10];
            let matchedOrderStatus = matchedOrder[11];

            // Both orders should have a `Closed` status
            expect(initOrderAmountFilled).to.eq(initOrderAmount);
            expect(initOrderStatus).to.eq(2);

            expect(matchedOrderAmountFilled).to.eq(matchedOrderAmount);
            expect(matchedOrderStatus).to.eq(2);

            // Whole lock of sell order should be spent
            expect(matchedOrderAmountLocked).to.eq(0);

            // Half of lock of buy order should be left
            expect(initOrderAmountLocked).to.eq(
                buyerShouldBeLocked.sub(buyerShouldBeSpent)
            );

            // Only fee from sell order should be left on dex balance
            expect(
                dexEndSellingTokenBalance.sub(dexInitialSellingTokenBalance)
            ).to.eq(sellerShouldBeFee);
            // Fee and some part of lock of buy order should be left on dex balance
            expect(
                dexEndReceivingTokenBalance.sub(dexInitialReceivingTokenBalance)
            ).to.eq(
                buyerShouldBeFee
                    .add(buyerShouldBeLocked)
                    .sub(buyerShouldBeSpent)
            );
        });
    });

    describe("Test pair decimals", () => {
        it("Should set decimals for new pair", async () => {
            let { dex, adminToken, tokenA, tokenB, tokenC } = await loadFixture(
                deploysNoQuoted
            );

            expect(await dex.getDecimals(tokenA.address, tokenC.address)).to.be.equal(0);

            let buyAmount = parseEther("10");
            let limitPrice = parseEther("1.5");

            await expect(dex
                .connect(ownerAcc)
                .startSaleSingle(
                    tokenA.address,
                    tokenC.address,
                    buyAmount,
                    limitPrice,
                )).to.be.emit(dex, "DecimalsChanged")
                .withArgs(
                    tokenA.address,
                    tokenC.address,
                    4
                );

            expect(await dex.getDecimals(tokenA.address, tokenC.address)).to.be.equal(4);
        });

        it("Should set decimals for pair by admin", async () => {
            let { dex, adminToken, tokenA, tokenB, tokenC } = await loadFixture(
                deploysNoQuoted
            );

            let buyAmount = parseEther("10");
            let limitPrice = parseEther("1.5");

            await expect(dex
                .connect(ownerAcc)
                .startSaleSingle(
                    tokenA.address,
                    tokenC.address,
                    buyAmount,
                    limitPrice,
                )).to.be.emit(dex, "DecimalsChanged")
                .withArgs(
                    tokenA.address,
                    tokenC.address,
                    4
                );

            expect(await dex.getDecimals(tokenA.address, tokenC.address)).to.be.equal(4);

            await expect(dex.setDecimals(tokenA.address, tokenC.address, 6))
                .to.be.emit(dex, "DecimalsChanged")
                .withArgs(
                    tokenA.address,
                    tokenC.address,
                    6
                );

            expect(await dex.getDecimals(tokenA.address, tokenC.address)).to.be.equal(6);
        });

        it("Should revert set decimals for pair by NOT admin", async () => {
            let { dex, adminToken, tokenA, tokenB, tokenC } = await loadFixture(
                deploysNoQuoted
            );

            expect(await dex.getDecimals(tokenA.address, tokenC.address)).to.be.equal(0);

            await expect(dex.connect(clientAcc1).setDecimals(tokenA.address, tokenC.address, 6)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });

        it("Should revert set decimals if decimals < 4", async () => {
            let { dex, adminToken, tokenA, tokenB, tokenC } = await loadFixture(
                deploysNoQuoted
            );

            expect(await dex.getDecimals(tokenA.address, tokenC.address)).to.be.equal(0);

            await expect(dex.setDecimals(tokenA.address, tokenC.address, 3))
                .to.be.revertedWithCustomError(dex, "InvalidDecimals");
        });

        it("Should revert if pair not created", async () => {
            let { dex, adminToken, tokenA, tokenB, tokenC } = await loadFixture(
                deploysNoQuoted
            );

            await expect(dex.setDecimals(tokenA.address, tokenC.address, 6))
                .to.be.revertedWithCustomError(dex, "PairNotCreated");
        });

        it("Should revert if first token address = 0", async () => {
            let { dex, adminToken, tokenA, tokenB, tokenC } = await loadFixture(
                deploysNoQuoted
            );

            await expect(dex.setDecimals(zeroAddress, tokenC.address, 6))
                .to.be.revertedWithCustomError(dex, "InvalidFirstTokenAddress");
        });

        it("Should NOT set decimals for pair if already setted default", async () => {
            let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                deploysQuotedB
            );

            expect(await dex.getDecimals(tokenA.address, tokenB.address)).to.be.equal(4);

            // Create a pair with native tokens
            let limitPriceForNative = parseEther("1.5");
            let sellAmountNative = parseEther("4");
            let feeRate = await dex.feeRate();
            let feeNative = sellAmountNative.mul(feeRate).div(10000);
            let totalLockNative = sellAmountNative.add(feeNative);
            await expect(dex
                .connect(ownerAcc)
                .startSaleSingle(
                    tokenA.address,
                    tokenB.address,
                    sellAmountNative,
                    limitPriceForNative,
                    { value: totalLockNative }
                )).to.be.not.emit(dex, "DecimalsChanged");

            expect(await dex.getDecimals(tokenA.address, tokenB.address)).to.be.equal(4);
        });
    });

    describe("Test token verify", () => {
        it("Should mark token as verify by admin", async () => {
            let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                deploysQuotedB
            );

            expect(await dex.getIsTokenVerified(tokenA.address)).to.be.false;

            await expect(dex.setIsTokenVerified(tokenA.address, true))
                .to.be.emit(dex, "IsTokenVerifiedChanged")
                .withArgs(
                    tokenA.address,
                    true
                );

            expect(await dex.getIsTokenVerified(tokenA.address)).to.be.true;
        });

        it("Should revert mark token as verify by NOT admin", async () => {
            let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                deploysQuotedB
            );

            await expect(dex.connect(clientAcc1).setIsTokenVerified(tokenA.address, true))
                .to.be.rejectedWith("Ownable: caller is not the owner");
        });

        it("Should revert mark token if token address = 0", async () => {
            let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                deploysQuotedB
            );

            await expect(dex.setIsTokenVerified(zeroAddress, true))
                .to.be.revertedWithCustomError(dex, "ZeroAddress");;
        });
    });
});
