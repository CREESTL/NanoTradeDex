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

// Initialize the backend account
const provider = ethers.getDefaultProvider();
const backendAcc = new ethers.Wallet(process.env.BACKEND_PRIVATE_KEY, provider);

// #H
describe("Benture DEX", () => {
    // Deploy all contracts before each test suite
    async function deploys() {
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

        // Max supply for all factory created tokens
        let maxSupply = parseEther("1000000000000000000");

        // Create new ERC20 and ERC721 and assign them to caller (owner)
        await factory.createERC20Token(
            "tokenA",
            "tokenA",
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
        return {
            dex,
            adminToken,
            tokenA,
            tokenB,
        };
    }

    // #D
    describe("Deployment", () => {
        it("Should deploy and have correct stats", async () => {
            let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                deploys
            );

            expect(await dex.feeRate()).to.eq(10);
            expect(await dex.backendAcc()).to.eq(backendAcc.address);
        });
    });

    // #M
    describe("Modifiers", () => {
        // #UQ
        describe("Update quotes", () => {
            it("Should update quoted token on first order creation", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
                );

                let buyAmount = parseEther("10");
                let slippage = 10;
                let limitPrice = parseEther("1.5");

                await expect(
                    dex.getPrice(tokenA.address, tokenB.address)
                ).to.be.revertedWithCustomError(dex, "NoQuotedTokens");

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
            it("Should should not update existing quoted token", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
                );

                let buyAmount = parseEther("10");
                let slippage = 10;
                let limitPrice = parseEther("1.5");

                await expect(
                    dex.getPrice(tokenA.address, tokenB.address)
                ).to.be.revertedWithCustomError(dex, "NoQuotedTokens");

                // Quotes updated here. `tokenB` is quoted
                await dex.buyLimit(
                    tokenA.address,
                    tokenB.address,
                    buyAmount,
                    limitPrice
                );

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
                    deploys
                );

                let buyAmount = parseEther("10");
                let slippage = 10;
                let limitPrice = parseEther("1.5");

                // Suppose that this order is waiting in the orderbook
                // ID1
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
                // ID2
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
                    2,
                    [1],
                    777
                );
                await dex.matchOrders(2, [1], nonce, signatureMatch);

                // Second call should fail
                await expect(
                    dex.matchOrders(2, [1], nonce, signatureMatch)
                ).to.be.revertedWithCustomError(dex, "TxAlreadyExecuted");
            });

            it("Should fail to call functions if signature is invalid", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
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
    });

    // #S
    describe("Setters", () => {
        describe("Set fee rate", () => {
            it("Should set new fee", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
                );
                let oldFee = await dex.feeRate();
                await dex.setFee(oldFee.mul(2));
                let newFee = await dex.feeRate();
                expect(newFee.div(oldFee)).to.eq(2);
            });

            it("Should fail to set new fee if caller is not owner", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
                );
                let oldFee = await dex.feeRate();
                await expect(
                    dex.connect(clientAcc1).setFee(oldFee.mul(2))
                ).to.be.revertedWith("Ownable: caller is not the owner");
            });

            it("Should fail to set same fee rate", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
                );
                let oldFee = await dex.feeRate();
                await expect(dex.setFee(oldFee)).to.be.revertedWithCustomError(
                    dex,
                    "SameFee"
                );
            });
        });

        describe("Set backend", () => {
            it("Should set new backend", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
                );
                let oldBackend = await dex.backendAcc();
                await dex.setBackend(randomAddress);
                let newBackend = await dex.backendAcc();
                expect(oldBackend).not.to.eq(newBackend);
                expect(newBackend).to.eq(randomAddress);
            });

            it("Should fail to set new backend if caller is not owner", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
                );
                await expect(
                    dex.connect(clientAcc1).setBackend(randomAddress)
                ).to.be.revertedWith("Ownable: caller is not the owner");
            });

            it("Should fail to set same backend", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
                );
                await expect(
                    dex.setBackend(backendAcc.address)
                ).to.be.revertedWithCustomError(dex, "SameBackend");
            });

            it("Should fail to set zero address backend", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
                );
                await expect(
                    dex.setBackend(zeroAddress)
                ).to.be.revertedWithCustomError(dex, "ZeroAddress");
            });
        });
    });

    // #G
    describe("Getters", () => {
        describe("Get orders", () => {
            it("Should get orders created by a user", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
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
                expect(ids[0]).to.eq(1);
                expect(ids[1]).to.eq(2);
                expect(ids.length).to.eq(2);
            });

            it("Should fail to get orders of zero address user", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
                );

                await expect(
                    dex.getUserOrders(zeroAddress)
                ).to.be.revertedWithCustomError(dex, "ZeroAddress");
            });

            it("Should get order by id", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
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

                let order = await dex.getOrder(1);

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
                    deploys
                );

                await expect(dex.getOrder(777)).to.be.revertedWithCustomError(
                    dex,
                    "OrderDoesNotExist"
                );
            });

            it("Should get list of orders by tokens", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
                );

                let ids = await dex
                    .connect(clientAcc1)
                    .getOrdersByTokens(tokenA.address, tokenB.address);
                expect(ids.length).to.eq(0);

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
                expect(ids.length).to.eq(1);
                expect(ids[0]).to.eq(1);

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
                expect(ids[1]).to.eq(2);
            });

            it("Should fail to get orders by tokens", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
                );

                await expect(
                    dex.getOrdersByTokens(zeroAddress, tokenB.address)
                ).to.be.revertedWithCustomError(
                    dex,
                    "InvalidFirstTokenAddress"
                );
            });
        });

        describe("Check that order exists", () => {
            it("Should check that order exists", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
                );

                expect(await dex.checkOrderExists(0)).to.eq(false);

                expect(await dex.checkOrderExists(1)).to.eq(false);

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

                expect(await dex.checkOrderExists(1)).to.eq(true);
            });
        });

        describe("Check that two orders matched", () => {
            it("Should check that two orders matched", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
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

                expect(await dex.checkMatched(1, 2)).to.eq(false);
                expect(await dex.checkMatched(2, 1)).to.eq(false);

                let signature = await hashAndSignMatch(
                    dex.address,
                    2,
                    [1],
                    777
                );
                await dex.matchOrders(2, [1], 777, signature);

                expect(await dex.checkMatched(1, 2)).to.eq(true);
                expect(await dex.checkMatched(2, 1)).to.eq(true);
            });

            it("Should fail to check matched orders if they don't exist", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
                );

                await expect(
                    dex.checkMatched(1, 2)
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

                await expect(
                    dex.checkMatched(1, 2)
                ).to.be.revertedWithCustomError(dex, "OrderDoesNotExist");
            });
        });
    });

    // #MO
    describe("Market orders", () => {
        // #MBO
        describe("Buy orders", () => {
            it("Should create market buy orders", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
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
                        2,
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
                let order = await dex.getOrder(2);

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
                    deploys
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

            it("Should fail to create market buy order as first order", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
                );

                let buyAmount = parseEther("10");
                let slippage = 10;
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
                ).to.be.revertedWithCustomError(dex, "ZeroPrice");
            });
        });

        // #MSO
        describe("Sell orders", () => {
            it("Should create market sell orders", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
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

                await dex.buyLimit(
                    tokenA.address,
                    tokenB.address,
                    sellAmount,
                    limitPrice
                );

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
                        2,
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
                let order = await dex.getOrder(2);

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
                    deploys
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

                await dex.buyLimit(
                    tokenA.address,
                    tokenB.address,
                    sellAmount,
                    limitPrice
                );

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

            it("Should fail to create market sell order as first order", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
                );

                let sellAmount = parseEther("10");
                let slippage = 10;
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
                ).to.be.revertedWithCustomError(dex, "ZeroPrice");
            });
        });
    });

    // #LO
    describe("Limit orders", () => {
        // #LBO
        describe("Buy orders", () => {
            it("Should create limit buy orders", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
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
                        1,
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
                let order = await dex.getOrder(1);

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
                    deploys
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
                let order = await dex.getOrder(1);

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
                    deploys
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

                await expect(
                    dex
                        .connect(clientAcc1)
                        .buyLimit(
                            zeroAddress,
                            tokenB.address,
                            parseEther("1"),
                            limitPrice
                        )
                ).to.be.revertedWithCustomError(
                    dex,
                    "InvalidFirstTokenAddress"
                );
            });
        });

        // #LSO
        describe("Sell orders", () => {
            it("Should create limit sell orders", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
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
                        1,
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
                let order = await dex.getOrder(1);

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
                deploys
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

            let order = await dex.getOrder(1);
            let status = order[11];
            expect(status).to.eq(0);

            await expect(dex.connect(clientAcc1).cancelOrder(1))
                .to.emit(dex, "OrderCancelled")
                .withArgs(1);

            let endDexBalance = await tokenB.balanceOf(dex.address);

            // Whole lock and fee should be returned to the user
            expect(startDexBalance.sub(endDexBalance)).to.eq(
                shouldBeLocked.add(shouldBeFee)
            );

            // Order status should change
            order = await dex.getOrder(1);
            status = order[11];
            expect(status).to.eq(3);
        });

        it("Should cancel partially executed order", async () => {
            let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                deploys
            );

            let sellAmount = parseEther("10");
            // Make buy amount 4 times less
            // This should make ID1 partially executed
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

            let signature = await hashAndSignMatch(dex.address, 2, [1], nonce);
            await dex.matchOrders(2, [1], nonce, signature);

            // Check that order is partially closed
            let order = await dex.getOrder(1);
            let status = order[11];
            expect(status).to.eq(1);

            let startDexBalance = await tokenB.balanceOf(dex.address);

            // Cancel partially executed order
            await dex.connect(clientAcc1).cancelOrder(1);

            let endDexBalance = await tokenB.balanceOf(dex.address);

            // 1/4 of ID1 was executed, so full lock and 3/4 of fee
            // should be returned
            expect(startDexBalance.sub(endDexBalance)).to.eq(
                sellerShouldBeLocked
                    .sub(sellerShouldBeSpent)
                    .add(sellerShouldBeFee.mul(3).div(4))
            );

            // Check that order is cancelled
            order = await dex.getOrder(1);
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
                deploys
            );

            let buyAmount = parseEther("10");
            let limitPrice = parseEther("1.5");
            let mintAmount = parseEther("1000000");

            await tokenA.mint(clientAcc1.address, mintAmount);
            await tokenB.mint(clientAcc1.address, mintAmount);
            await tokenA.connect(clientAcc1).approve(dex.address, mintAmount);
            await tokenB.connect(clientAcc1).approve(dex.address, mintAmount);

            // Create a non-cancellable order
            await dex
                .connect(ownerAcc)
                .startSaleSingle(
                    tokenA.address,
                    tokenB.address,
                    buyAmount,
                    limitPrice
                );

            await expect(
                dex.connect(clientAcc1).cancelOrder(1)
            ).to.be.revertedWithCustomError(dex, "NonCancellable");

            // Create the second order, cancel it and try to cancel again
            await dex
                .connect(clientAcc1)
                .buyLimit(
                    tokenA.address,
                    tokenB.address,
                    buyAmount,
                    limitPrice
                );

            await dex.connect(clientAcc1).cancelOrder(2);

            await expect(
                dex.connect(clientAcc1).cancelOrder(2)
            ).to.be.revertedWithCustomError(dex, "InvalidOrderStatus");

            // Create the third order and try to cancel it from another account
            await dex
                .connect(clientAcc1)
                .buyLimit(
                    tokenA.address,
                    tokenB.address,
                    buyAmount,
                    limitPrice
                );

            await expect(
                dex.connect(ownerAcc).cancelOrder(3)
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
            it("Should start a single sale", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
                );

                let sellAmount = parseEther("10");
                let limitPrice = parseEther("1.5");
                let mintAmount = parseEther("1000000");

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
                let order = await dex.getOrder(1);

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
        });

        // #SM
        describe("Multiple sale", () => {
            it("Should start multiple sale", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
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

                let order1 = await dex.getOrder(1);
                let order2 = await dex.getOrder(2);
                let order3 = await dex.getOrder(3);
                let order4 = await dex.getOrder(4);

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
                    deploys
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
                            await loadFixture(deploys);

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
                        await dex.connect(clientAcc1).sellLimit(
                            tokenA.address,
                            tokenB.address,
                            sellAmount,
                            // This price should become initial market price
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

                        let [, pairInitialPrice] = await dex.getPrice(
                            tokenA.address,
                            tokenB.address
                        );

                        let signatureMatch = await hashAndSignMatch(
                            dex.address,
                            2,
                            [1],
                            777
                        );

                        await expect(
                            dex.matchOrders(2, [1], nonce, signatureMatch)
                        )
                            .to.emit(dex, "OrdersMatched")
                            .withArgs(2, 1);

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
                        let initOrder = await dex.getOrder(2);
                        let initOrderAmount = initOrder[3];
                        let initOrderAmountFilled = initOrder[4];
                        let initOrderAmountLocked = initOrder[10];
                        let initOrderStatus = initOrder[11];

                        let matchedOrder = await dex.getOrder(1);
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
                            await loadFixture(deploys);

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
                        // BUT! Orders will be executed by later market price
                        // Calculate amount spent by buyer using market price
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
                        await dex.connect(clientAcc1).sellLimit(
                            tokenA.address,
                            tokenB.address,
                            sellAmount,
                            // This price should become initial market price
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

                        let a = await dex.getOrder(2);
                        let b = a[10];
                        expect(b).to.eq(buyerShouldBeLocked);

                        let signatureMatch = await hashAndSignMatch(
                            dex.address,
                            2,
                            [1],
                            777
                        );

                        await expect(
                            dex.matchOrders(2, [1], nonce, signatureMatch)
                        )
                            .to.emit(dex, "OrdersMatched")
                            .withArgs(2, 1);

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

                        let initOrder = await dex.getOrder(2);
                        let initOrderAmount = initOrder[3];
                        let initOrderAmountFilled = initOrder[4];
                        let initOrderAmountLocked = initOrder[10];
                        let initOrderStatus = initOrder[11];

                        let matchedOrder = await dex.getOrder(1);
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
                            await loadFixture(deploys);

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

                        // Create the first order to set quoted token and price
                        // ID1
                        await dex.connect(ownerAcc).buyLimit(
                            tokenB.address,
                            // tokenA becomes a quoted token
                            tokenA.address,
                            sellAmount,
                            limitPrice
                        );

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
                            // Use false because tokenA is quoted and we pay with tokenB
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
                        let sellerShouldBeFee =
                            calcFeeAmount(sellerShouldBeLocked);

                        // Create the second order that will actually be matched afterwards
                        // matchedOrder
                        // ID2
                        await dex
                            .connect(clientAcc1)
                            .buyLimit(
                                tokenA.address,
                                tokenB.address,
                                buyAmount,
                                limitPrice
                            );

                        // initOrder
                        // ID3
                        await dex.connect(clientAcc2).sellLimit(
                            tokenB.address,
                            // make the same locked token as quoted token (in ID1)
                            tokenA.address,
                            sellAmount,
                            limitPrice
                        );

                        let signatureMatch = await hashAndSignMatch(
                            dex.address,
                            3,
                            [2],
                            nonce
                        );

                        await expect(
                            dex.matchOrders(3, [2], nonce, signatureMatch)
                        )
                            .to.emit(dex, "OrdersMatched")
                            .withArgs(3, 2);

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
                        let initOrder = await dex.getOrder(3);
                        let initOrderAmount = initOrder[3];
                        let initOrderAmountFilled = initOrder[4];
                        let initOrderAmountLocked = initOrder[10];
                        let initOrderStatus = initOrder[11];

                        let matchedOrder = await dex.getOrder(2);
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
                            await loadFixture(deploys);

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

                        // Create the first order to set quoted token and price
                        // ID1
                        await dex.connect(ownerAcc).buyLimit(
                            tokenB.address,
                            // tokenA becomes a quoted token
                            tokenA.address,
                            sellAmount,
                            limitPrice
                        );

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
                            // Use false because tokenA is quoted and we pay with tokenB
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
                        let buyerShouldBeFee =
                            calcFeeAmount(buyerShouldBeLocked);

                        let sellerShouldBeLocked = sellAmount;
                        let sellerShouldBeFee =
                            calcFeeAmount(sellerShouldBeLocked);

                        // Create the second order that will actually be matched afterwards
                        // matchedOrder
                        // ID2
                        await dex
                            .connect(clientAcc1)
                            .buyLimit(
                                tokenA.address,
                                tokenB.address,
                                buyAmount,
                                limitPrice
                            );

                        // initOrder
                        // ID3
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
                            3,
                            [2],
                            nonce
                        );

                        await expect(
                            dex.matchOrders(3, [2], nonce, signatureMatch)
                        )
                            .to.emit(dex, "OrdersMatched")
                            .withArgs(3, 2);

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

                        let initOrder = await dex.getOrder(3);
                        let initOrderAmount = initOrder[3];
                        let initOrderAmountFilled = initOrder[4];
                        let initOrderAmountLocked = initOrder[10];
                        let initOrderStatus = initOrder[11];

                        let matchedOrder = await dex.getOrder(2);
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
                                await loadFixture(deploys);

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
                                2,
                                [1],
                                nonce
                            );

                            await expect(
                                dex.matchOrders(2, [1], nonce, signatureMatch)
                            )
                                .to.emit(dex, "OrdersMatched")
                                .withArgs(2, 1);

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
                            let initOrder = await dex.getOrder(2);
                            let initOrderAmount = initOrder[3];
                            let initOrderAmountFilled = initOrder[4];
                            let initOrderAmountLocked = initOrder[10];
                            let initOrderStatus = initOrder[11];

                            let matchedOrder = await dex.getOrder(1);
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
                                await loadFixture(deploys);

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
                                2,
                                [1],
                                nonce
                            );

                            await expect(
                                dex.matchOrders(2, [1], nonce, signatureMatch)
                            )
                                .to.emit(dex, "OrdersMatched")
                                .withArgs(2, 1);

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

                            let initOrder = await dex.getOrder(2);
                            let initOrderAmount = initOrder[3];
                            let initOrderAmountFilled = initOrder[4];
                            let initOrderAmountLocked = initOrder[10];
                            let initOrderStatus = initOrder[11];

                            let matchedOrder = await dex.getOrder(1);
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
                                await loadFixture(deploys);

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

                            // Create the first order to set quoted token and price
                            // ID1
                            await dex.connect(ownerAcc).buyLimit(
                                tokenB.address,
                                // tokenA becomes a quoted token
                                tokenA.address,
                                sellAmount,
                                limitPrice
                            );

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
                                // Use false because tokenA is quoted and we pay with tokenB
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
                            let sellerShouldBeFee =
                                calcFeeAmount(sellerShouldBeLocked);

                            // Create the second order that will actually be matched afterwards
                            // matchedOrder
                            // ID2
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
                            // ID3
                            await dex.connect(clientAcc2).sellMarket(
                                tokenB.address,
                                // make the same locked token as quoted token (in ID1)
                                tokenA.address,
                                sellAmount,
                                slippage,
                                nonce,
                                signatureMarket
                            );

                            let signatureMatch = await hashAndSignMatch(
                                dex.address,
                                3,
                                [2],
                                nonce
                            );

                            await expect(
                                dex.matchOrders(3, [2], nonce, signatureMatch)
                            )
                                .to.emit(dex, "OrdersMatched")
                                .withArgs(3, 2);

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
                            let initOrder = await dex.getOrder(3);
                            let initOrderAmount = initOrder[3];
                            let initOrderAmountFilled = initOrder[4];
                            let initOrderAmountLocked = initOrder[10];
                            let initOrderStatus = initOrder[11];

                            let matchedOrder = await dex.getOrder(2);
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
                                await loadFixture(deploys);

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

                            // Create the first order to set quoted token and price
                            // ID1
                            await dex.connect(ownerAcc).buyLimit(
                                tokenB.address,
                                // tokenA becomes a quoted token
                                tokenA.address,
                                sellAmount,
                                limitPrice
                            );

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
                                // Use false because tokenA is quoted and we pay with tokenB
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
                            let buyerShouldBeFee =
                                calcFeeAmount(buyerShouldBeLocked);

                            let sellerShouldBeLocked = sellAmount;
                            let sellerShouldBeFee =
                                calcFeeAmount(sellerShouldBeLocked);

                            // Create the second order that will actually be matched afterwards
                            // matchedOrder
                            // ID2
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
                            // ID3
                            await dex.connect(clientAcc2).sellMarket(
                                tokenB.address,
                                // make the same locked token as quoted token (in ID1)
                                tokenA.address,
                                sellAmount,
                                slippage,
                                nonce,
                                signatureMarket
                            );

                            let signatureMatch = await hashAndSignMatch(
                                dex.address,
                                3,
                                [2],
                                nonce
                            );

                            await expect(
                                dex.matchOrders(3, [2], nonce, signatureMatch)
                            )
                                .to.emit(dex, "OrdersMatched")
                                .withArgs(3, 2);

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
                            let initOrder = await dex.getOrder(3);
                            let initOrderAmount = initOrder[3];
                            let initOrderAmountFilled = initOrder[4];
                            let initOrderAmountLocked = initOrder[10];
                            let initOrderStatus = initOrder[11];

                            let matchedOrder = await dex.getOrder(2);
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
                it("Should revert if slippage was too high", async () => {
                    let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                        deploys
                    );

                    let mintAmount = parseEther("1000000");
                    let sellAmount = parseEther("10");
                    let buyAmount = sellAmount;
                    // Make slippage 10%. Revert in any case
                    let slippage = 10;
                    // Initial price to be set in the first order
                    let initialPrice = parseEther("5");
                    // Price of the second order should be lower to cause slippage
                    let limitPrice = parseEther("1");
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

                    // Create the first order just to set a market price
                    // ID1
                    await dex
                        .connect(clientAcc1)
                        .sellLimit(
                            tokenA.address,
                            tokenB.address,
                            sellAmount,
                            initialPrice
                        );

                    // Create another limit order to be matched later
                    // ID2
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

                    // ID3
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
                        3,
                        [2],
                        nonce
                    );

                    await expect(
                        dex.matchOrders(3, [2], nonce, signatureMatch)
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
                            await loadFixture(deploys);

                        let mintAmount = parseEther("1000000");
                        let sellAmount = parseEther("10");
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

                        await tokenA
                            .connect(ownerAcc)
                            .approve(dex.address, mintAmount);

                        // Create the first order to set quoted token and price
                        // ID1
                        await dex.connect(ownerAcc).buyLimit(
                            tokenB.address,
                            // tokenA becomes a quoted token
                            tokenA.address,
                            sellAmount,
                            limitPrice
                        );

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
                        // ID2
                        await dex
                            .connect(clientAcc1)
                            .sellLimit(
                                tokenA.address,
                                tokenB.address,
                                sellAmount,
                                limitPrice
                            );

                        // initOrder
                        // ID3
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
                            3,
                            [2],
                            nonce
                        );

                        await expect(
                            dex.matchOrders(3, [2], nonce, signatureMatch)
                        )
                            .to.emit(dex, "OrdersMatched")
                            .withArgs(3, 2);

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

                        let initOrder = await dex.getOrder(3);
                        let initOrderAmount = initOrder[3];
                        let initOrderAmountFilled = initOrder[4];
                        let initOrderAmountLocked = initOrder[10];
                        let initOrderStatus = initOrder[11];

                        let matchedOrder = await dex.getOrder(2);
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
                            buyerShouldBeLocked.div(2)
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
                            await loadFixture(deploys);

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

                        await tokenA
                            .connect(ownerAcc)
                            .approve(dex.address, mintAmount);

                        // Create the first order to set quoted token and price
                        // ID1
                        await dex.connect(ownerAcc).buyLimit(
                            tokenB.address,
                            // tokenA becomes a quoted token
                            tokenA.address,
                            sellAmount,
                            limitPrice
                        );

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
                            false,
                            true
                        );
                        let buyerShouldBeFee =
                            calcFeeAmount(buyerShouldBeLocked);

                        // matchedOrder
                        // ID2
                        await dex
                            .connect(clientAcc1)
                            .sellLimit(
                                tokenA.address,
                                tokenB.address,
                                sellAmount,
                                limitPrice
                            );

                        // initOrder
                        // ID3
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
                            3,
                            [2],
                            nonce
                        );

                        await expect(
                            dex.matchOrders(3, [2], nonce, signatureMatch)
                        )
                            .to.emit(dex, "OrdersMatched")
                            .withArgs(3, 2);

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

                        let initOrder = await dex.getOrder(3);
                        let initOrderAmount = initOrder[3];
                        let initOrderAmountFilled = initOrder[4];
                        let initOrderAmountLocked = initOrder[10];
                        let initOrderStatus = initOrder[11];

                        let matchedOrder = await dex.getOrder(2);
                        let matchedOrderAmount = matchedOrder[3];
                        let matchedOrderAmountFilled = matchedOrder[4];
                        let matchedOrderAmountLocked = matchedOrder[10];
                        let matchedOrderStatus = matchedOrder[11];

                        // Both orders should be closed
                        expect(initOrderAmountFilled).to.eq(initOrderAmount);
                        expect(matchedOrderAmountFilled).to.eq(
                            matchedOrderAmount
                        );
                        expect(matchedOrderStatus).to.eq(2);
                        expect(initOrderStatus).to.eq(2);

                        // Whole lock of both orders gets spent
                        expect(matchedOrderAmountLocked).to.eq(0);
                        expect(initOrderAmountLocked).to.eq(0);

                        // Only fee from both orders should be left on dex balance
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
                        ).to.eq(buyerShouldBeFee);
                    });

                    it("Should match greater sell order with smaller buy order when sell order tokenB is quoted", async () => {
                        let { dex, adminToken, tokenA, tokenB } =
                            await loadFixture(deploys);

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

                        // Create the first order to set quoted token and price
                        // ID1
                        await dex.connect(ownerAcc).buyLimit(
                            tokenB.address,
                            // tokenA becomes a quoted token
                            tokenA.address,
                            sellAmount,
                            limitPrice
                        );

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
                        // ID2
                        await dex
                            .connect(clientAcc1)
                            .buyLimit(
                                tokenA.address,
                                tokenB.address,
                                buyAmount,
                                limitPrice
                            );

                        // initOrder
                        // ID3
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
                            3,
                            [2],
                            nonce
                        );

                        await expect(
                            dex.matchOrders(3, [2], nonce, signatureMatch)
                        )
                            .to.emit(dex, "OrdersMatched")
                            .withArgs(3, 2);

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

                        let initOrder = await dex.getOrder(3);
                        let initOrderAmount = initOrder[3];
                        let initOrderAmountFilled = initOrder[4];
                        let initOrderAmountLocked = initOrder[10];
                        let initOrderStatus = initOrder[11];

                        let matchedOrder = await dex.getOrder(2);
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
                            sellerShouldBeLocked.div(2)
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
                        deploys
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

                    // Create the first order to set quoted token and price
                    // ID1
                    await dex.connect(ownerAcc).buyLimit(
                        tokenA.address,
                        // tokenB becomes a quoted token
                        tokenB.address,
                        sellAmount,
                        limitPrice
                    );

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
                    // ID2
                    await dex
                        .connect(clientAcc1)
                        .buyLimit(
                            tokenA.address,
                            tokenB.address,
                            buyAmount,
                            limitPrice
                        );

                    // initOrder
                    // ID3
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
                        3,
                        [2],
                        nonce
                    );

                    await expect(dex.matchOrders(3, [2], nonce, signatureMatch))
                        .to.emit(dex, "OrdersMatched")
                        .withArgs(3, 2);

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

                    let initOrder = await dex.getOrder(3);
                    let initOrderAmount = initOrder[3];
                    let initOrderAmountFilled = initOrder[4];
                    let initOrderAmountLocked = initOrder[10];
                    let initOrderStatus = initOrder[11];

                    let matchedOrder = await dex.getOrder(2);
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
                        sellerShouldBeLocked.div(2)
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
                        deploys
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

                    // Create the first order to set quoted token and price
                    // ID1
                    await dex.connect(ownerAcc).buyLimit(
                        tokenB.address,
                        // tokenA becomes a quoted token
                        tokenA.address,
                        buyAmount,
                        limitPrice
                    );

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

                    let buyerShouldBeFee = calcFeeAmount(buyerShouldBeLocked);

                    let sellerShouldBeLocked = sellAmount;
                    let sellerShouldBeSpent = calcSellerSpentAmount(
                        sellAmount,
                        buyAmount,
                        limitPrice,
                        false,
                        false,
                        true
                    );
                    let sellerShouldBeFee = calcFeeAmount(sellerShouldBeLocked);

                    // matchedOrder
                    // ID2
                    await dex
                        .connect(clientAcc1)
                        .buyLimit(
                            tokenB.address,
                            tokenA.address,
                            buyAmount,
                            limitPrice
                        );

                    // initOrder
                    // ID3
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
                        3,
                        [2],
                        nonce
                    );

                    await expect(dex.matchOrders(3, [2], nonce, signatureMatch))
                        .to.emit(dex, "OrdersMatched")
                        .withArgs(3, 2);

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

                    let initOrder = await dex.getOrder(3);
                    let initOrderAmount = initOrder[3];
                    let initOrderAmountFilled = initOrder[4];
                    let initOrderAmountLocked = initOrder[10];
                    let initOrderStatus = initOrder[11];

                    let matchedOrder = await dex.getOrder(2);
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
                        buyerShouldBeLocked.div(2)
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
                    deploys
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
                    2,
                    [1],
                    nonce
                );

                await dex.matchOrders(2, [1], nonce, signatureMatch);

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
                    deploys
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
                    2,
                    [1],
                    nonce
                );

                await dex.matchOrders(2, [1], nonce, signatureMatch);

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
        });

        // #WFR
        describe("Reverts", () => {
            it("Should fail to withdraw fees", async () => {
                let { dex, adminToken, tokenA, tokenB } = await loadFixture(
                    deploys
                );

                // Locked token cannot have a zero address
                let tokensToWithdraw = [tokenB.address, zeroAddress];
                await expect(
                    dex.connect(ownerAcc).withdrawFees(tokensToWithdraw)
                ).to.be.revertedWithCustomError(dex, "ZeroAddress");

                // None of orders was created but we try to withdraw fees
                await expect(
                    dex.connect(ownerAcc).withdrawAllFees()
                ).to.be.revertedWithCustomError(dex, "NoFeesToWithdraw");

                // All orders must be closed
                let mintAmount = parseEther("1000000");
                let sellAmount = parseEther("10");
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

                // Order has not been matched by we try to withdraw fees
                await expect(
                    dex.connect(ownerAcc).withdrawAllFees()
                ).to.be.revertedWithCustomError(dex, "InvalidStatusForFees");
            });
        });
    });
});
