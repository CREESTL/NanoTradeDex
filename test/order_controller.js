/* eslint-disable no-plusplus */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-underscore-dangle */
/* eslint-disable max-len */
const {
  constants,
  expectEvent,
  expectRevert,
  BN,
  ether,
} = require("@openzeppelin/test-helpers");
const { keccak256 } = require("web3-utils");
const { expect } = require("chai");
const { processEventsArgs, processEventArgs } = require("./utils");

const { ZERO_ADDRESS } = constants;
const ZERO = new BN("0");

const OrderController = artifacts.require("OrderController");
const MockOrderController = artifacts.require("MockOrderController");
const Mock = artifacts.require("MockERC20");

contract("OrdersController", ([owner, alice, bob]) => {
  beforeEach(async () => {
    this.orderController = await OrderController.new(25, { from: owner });
    this.mockOrderController = await MockOrderController.new(25, {
      from: owner,
    });
    this.weth = await Mock.new("WrapperETH", "WTH", ether("1000000"), {
      from: alice,
    });
    this.dai = await Mock.new("DAI", "DAI", ether("1000000"), { from: bob });
    await this.weth.approve(
      this.mockOrderController.address,
      ether("1000000"),
      { from: alice }
    );
    await this.dai.approve(this.mockOrderController.address, ether("1000000"), {
      from: bob,
    });
    await this.weth.approve(this.orderController.address, ether("1000000"), {
      from: alice,
    });
    await this.dai.approve(this.orderController.address, ether("1000000"), {
      from: bob,
    });
  });

  describe("createOrder should work", async () => {
    it("should create new order", async () => {
      const receipt = await this.orderController.createOrder(
        this.dai.address,
        this.weth.address,
        new BN("100"),
        new BN("100"),
        { from: alice }
      );
      const id = await this.orderController.getOrderId(
        (await this.orderController.getOrderIdLength()) - 1
      );
      expectEvent(receipt, "OrderCreated", {
        id,
        amountA: new BN("100"),
        amountB: new BN("100"),
        tokenA: this.dai.address,
        tokenB: this.weth.address,
        user: alice,
      });
    });
    it("should fail because 0 amount were provided for either or both tokens", async () => {
      await expectRevert(
        this.orderController.createOrder(
          this.dai.address,
          this.weth.address,
          new BN("0"),
          new BN("100"),
          { from: alice }
        ),
        "OC:BAD_AMOUNT"
      );
      await expectRevert(
        this.orderController.createOrder(
          this.dai.address,
          this.weth.address,
          new BN("100"),
          new BN("0"),
          { from: alice }
        ),
        "OC:BAD_AMOUNT"
      );
      await expectRevert(
        this.orderController.createOrder(
          this.dai.address,
          this.weth.address,
          new BN("0"),
          new BN("0"),
          { from: alice }
        ),
        "OC:BAD_AMOUNT"
      );
    });
    it("should fail because 0 address was provided for either or both tokens", async () => {
      await expectRevert(
        this.orderController.createOrder(
          ZERO_ADDRESS,
          this.weth.address,
          new BN("100"),
          new BN("100"),
          { from: alice }
        ),
        "OC:ZERO_ADDRESS"
      );
      await expectRevert(
        this.orderController.createOrder(
          this.dai.address,
          ZERO_ADDRESS,
          new BN("100"),
          new BN("100"),
          { from: alice }
        ),
        "OC:ZERO_ADDRESS"
      );
      await expectRevert(
        this.orderController.createOrder(
          ZERO_ADDRESS,
          ZERO_ADDRESS,
          new BN("100"),
          new BN("100"),
          { from: alice }
        ),
        "OC:ZERO_ADDRESS"
      );
    });
    it("should fail because tokens have same address", async () => {
      await expectRevert(
        this.orderController.createOrder(
          this.weth.address,
          this.weth.address,
          new BN("100"),
          new BN("100"),
          { from: alice }
        ),
        "OC:BAD_PAIR"
      );
    });
  });

  describe("check fee update", async () => {
    it("should update fee", async () => {
      expect(await this.orderController.getFee()).to.be.bignumber.equal(
        new BN("25")
      );
      await this.orderController.setFee(30);
      expect(await this.orderController.getFee()).to.be.bignumber.equal(
        new BN("30")
      );
    });
  });

  describe("check orderController token balance update", async () => {
    beforeEach(async () => {
      await this.orderController.createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("100"),
        { from: alice }
      );
    });
    it("should update tokenBalance mapping", async () => {
      const id1 = await this.orderController.getOrderId(
        (await this.orderController.getOrderIdLength()) - 1
      );
      expect(
        await this.weth.balanceOf(this.orderController.address)
      ).to.be.bignumber.equal(ether("100"));
      expect(
        await this.dai.balanceOf(this.orderController.address)
      ).to.be.bignumber.equal(ether("0"));
      // only updated by matching
      expect(
        await this.orderController.getAccumulatedFeeBalance(this.weth.address)
      ).to.be.bignumber.equal(ether("0"));
      await this.orderController.matchOrders(
        [id1],
        this.weth.address,
        this.dai.address,
        ether("100"),
        ether("150"),
        false,
        { from: bob }
      );
      expect(
        await this.dai.balanceOf(this.orderController.address)
      ).to.be.bignumber.equal(ether("0.25"));
      expect(
        await this.weth.balanceOf(this.orderController.address)
      ).to.be.bignumber.equal(ether("0.25"));
      // updated after matching and fee charged
      expect(
        await this.orderController.getAccumulatedFeeBalance(this.dai.address)
      ).to.be.bignumber.equal(ether("0.25"));
      expect(
        await this.orderController.getAccumulatedFeeBalance(this.weth.address)
      ).to.be.bignumber.equal(ether("0.25"));
    });

    it("should withdraw fee balance", async () => {
      const id1 = await this.orderController.getOrderId(
        (await this.orderController.getOrderIdLength()) - 1
      );
      await this.orderController.matchOrders(
        [id1],
        this.weth.address,
        this.dai.address,
        ether("100"),
        ether("150"),
        false,
        { from: bob }
      );
      // updated after matching and fee charged
      expect(
        await this.orderController.getAccumulatedFeeBalance(this.dai.address)
      ).to.be.bignumber.equal(ether("0.25"));
      expect(
        await this.orderController.getAccumulatedFeeBalance(this.weth.address)
      ).to.be.bignumber.equal(ether("0.25"));
      expect(await this.dai.balanceOf(owner)).to.be.bignumber.equal(ether("0"));
      await this.orderController.withdrawFee(this.dai.address);
      expect(await this.dai.balanceOf(owner)).to.be.bignumber.equal(
        ether("0.25")
      );
      expect(
        await this.orderController.getAccumulatedFeeBalance(this.dai.address)
      ).to.be.bignumber.equal(ether("0"));
      expect(
        await this.orderController.getAccumulatedFeeBalance(this.weth.address)
      ).to.be.bignumber.equal(ether("0.25"));
    });
  });

  describe("Check matchOrders function", async () => {
    it("should show correct initial dai and eth balance for alice, bob, orderController", async () => {
      expect(await this.weth.balanceOf(bob)).to.be.bignumber.equal(ether("0"));
      expect(await this.dai.balanceOf(alice)).to.be.bignumber.equal(ether("0"));
      expect(await this.weth.balanceOf(alice)).to.be.bignumber.equal(
        ether("1000000")
      );
      expect(await this.dai.balanceOf(bob)).to.be.bignumber.equal(
        ether("1000000")
      );

      expect(
        await this.weth.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("0"));
      expect(
        await this.dai.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("0"));
      expect(
        await this.weth.balanceOf(this.orderController.address)
      ).to.be.bignumber.equal(ether("0"));
      expect(
        await this.dai.balanceOf(this.orderController.address)
      ).to.be.bignumber.equal(ether("0"));
    });

    it("should take tokens from alice and store them on the contract", async () => {
      await this.orderController.createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("100"),
        { from: alice }
      );
      expect(await this.weth.balanceOf(alice)).to.be.bignumber.equal(
        ether("999900")
      );
      expect(
        await this.weth.balanceOf(this.orderController.address)
      ).to.be.bignumber.equal(ether("100"));
    });

    it("should match 2 new orders", async () => {
      await this.orderController.createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("100"),
        { from: alice }
      );
      const id1 = await this.orderController.getOrderId(
        (await this.orderController.getOrderIdLength()) - 1
      );
      await this.orderController.matchOrders(
        [id1],
        this.weth.address,
        this.dai.address,
        ether("100"),
        ether("150"),
        false,
        { from: bob }
      );
      const id2 = await this.orderController.getOrderId(
        (await this.orderController.getOrderIdLength()) - 1
      );
      expect(await this.weth.balanceOf(bob)).to.be.bignumber.equal(
        ether("99.75")
      );
      expect(await this.dai.balanceOf(alice)).to.be.bignumber.equal(
        ether("99.75")
      );
      expect(
        await this.weth.balanceOf(this.orderController.address)
      ).to.be.bignumber.equal(ether("0.25"));
      expect(
        await this.dai.balanceOf(this.orderController.address)
      ).to.be.bignumber.equal(ether("0.25"));
      // getOrderInfo(id1))[3] => amountLeftToFill
      // order id1 was filled and closed, matching order was filled instantly, thus no need to create new order for bob
      expect(
        (await this.orderController.getOrderInfo(id1))[3]
      ).to.be.bignumber.equal(ether("0"));
      expect(
        (await this.orderController.getOrderInfo(id2))[3]
      ).to.be.bignumber.equal(ether("0"));
    });

    it("check correct fee in events", async () => {
      await this.orderController.createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("100"),
        { from: alice }
      );
      const id1 = await this.orderController.getOrderId(
        (await this.orderController.getOrderIdLength()) - 1
      );

      await this.orderController.createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("100"),
        { from: alice }
      );
      const id2 = await this.orderController.getOrderId(
        (await this.orderController.getOrderIdLength()) - 1
      );

      await this.orderController.createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("100"),
        { from: alice }
      );
      const id3 = await this.orderController.getOrderId(
        (await this.orderController.getOrderIdLength()) - 1
      );

      const matchHash = await this.orderController.matchOrders(
        [id1, id2, id3],
        this.weth.address,
        this.dai.address,
        ether("250"),
        ether("250"),
        false,
        { from: bob }
      );
      const id4 = await this.orderController.getOrderId(
        (await this.orderController.getOrderIdLength()) - 1
      );

      // console.log(matchHash);
      expect(matchHash.logs[1].args.fee).to.be.bignumber.equal(ether("0.25"));
      expect(matchHash.logs[2].args.fee).to.be.bignumber.equal(ether("0.25"));
      expect(matchHash.logs[3].args.fee).to.be.bignumber.equal(ether("0.125"));
      expect(matchHash.logs[4].args.fee).to.be.bignumber.equal(ether("0.625"));

      expect(await this.weth.balanceOf(bob)).to.be.bignumber.equal(
        ether("249.375")
      );
      expect(await this.dai.balanceOf(alice)).to.be.bignumber.equal(
        ether("249.375")
      );
      expect(
        await this.weth.balanceOf(this.orderController.address)
      ).to.be.bignumber.equal(ether("50.625"));
      expect(
        await this.dai.balanceOf(this.orderController.address)
      ).to.be.bignumber.equal(ether("0.625"));
      // getOrderInfo(id1))[3] => amountLeftToFill
      // order id1 was filled and closed, matching order was filled instantly, thus no need to create new order for bob
      expect(
        (await this.orderController.getOrderInfo(id1))[3]
      ).to.be.bignumber.equal(ether("0"));
      expect(
        (await this.orderController.getOrderInfo(id2))[3]
      ).to.be.bignumber.equal(ether("0"));
    });

    it("should match 2 orders", async () => {
      await this.mockOrderController._createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("200"),
        ether("50"),
        alice,
        false,
        { from: alice }
      );
      expect(
        await this.weth.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("100"));
      const id1 = await this.mockOrderController.getOrderId(
        (await this.mockOrderController.getOrderIdLength()) - 1
      );
      await this.mockOrderController.matchOrders(
        [id1],
        this.weth.address,
        this.dai.address,
        ether("100"),
        ether("150"),
        false,
        { from: bob }
      );
      const id2 = await this.mockOrderController.getOrderId(
        (await this.mockOrderController.getOrderIdLength()) - 1
      );
      expect(await this.weth.balanceOf(bob)).to.be.bignumber.equal(
        ether("99.75")
      );
      expect(await this.dai.balanceOf(alice)).to.be.bignumber.equal(
        ether("49.875")
      );
      expect(
        await this.weth.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("0.25"));
      expect(
        await this.dai.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("0.125"));
      // order id1 was filled and closed, matching order was filled instantly, thus no need to create new order for bob
      // getOrderInfo(id1))[3] => amountLeftToFill
      expect(
        (await this.mockOrderController.getOrderInfo(id1))[3]
      ).to.be.bignumber.equal(ether("0"));
      expect(
        (await this.mockOrderController.getOrderInfo(id2))[3]
      ).to.be.bignumber.equal(ether("0"));
    });

    it("should match 2 new orders", async () => {
      await this.orderController.createOrder(
        this.dai.address,
        this.weth.address,
        ether("1000"),
        ether("10"),
        { from: alice }
      );
      const id1 = await this.orderController.getOrderId(
        (await this.orderController.getOrderIdLength()) - 1
      );
      await this.orderController.matchOrders(
        [id1],
        this.weth.address,
        this.dai.address,
        ether("10"),
        ether("1000"),
        false,
        { from: bob }
      );
      const id2 = await this.orderController.getOrderId(
        (await this.orderController.getOrderIdLength()) - 1
      );
      expect(await this.weth.balanceOf(bob)).to.be.bignumber.equal(
        ether("9.975")
      );
      expect(await this.dai.balanceOf(alice)).to.be.bignumber.equal(
        ether("997.5")
      );
      expect(
        await this.weth.balanceOf(this.orderController.address)
      ).to.be.bignumber.equal(ether("0.025"));
      expect(
        await this.dai.balanceOf(this.orderController.address)
      ).to.be.bignumber.equal(ether("2.5"));
      // order id1 was filled and closed, matching order was filled instantly, thus no need to create new order for bob
      // getOrderInfo(id1))[3] => amountLeftToFill
      expect(
        (await this.orderController.getOrderInfo(id1))[3]
      ).to.be.bignumber.equal(ether("0"));
      expect(
        (await this.orderController.getOrderInfo(id2))[3]
      ).to.be.bignumber.equal(ether("0"));
    });

    it("should match 2 orders, alice`s order is 30 tokens to fill", async () => {
      await this.mockOrderController._createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("100"),
        ether("30"),
        alice,
        false,
        { from: alice }
      );
      const id1 = await this.mockOrderController.getOrderId(
        (await this.mockOrderController.getOrderIdLength()) - 1
      );
      await this.mockOrderController.matchOrders(
        [id1],
        this.weth.address,
        this.dai.address,
        ether("100"),
        ether("150"),
        false,
        { from: bob }
      );
      const id2 = await this.mockOrderController.getOrderId(
        (await this.mockOrderController.getOrderIdLength()) - 1
      );
      expect(await this.weth.balanceOf(bob)).to.be.bignumber.equal(
        ether("29.925")
      );
      expect(await this.dai.balanceOf(alice)).to.be.bignumber.equal(
        ether("29.925")
      );
      expect(
        await this.weth.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("0.075"));
      // bob places new order in automatic order creation, 70 left to fill * priceRationBA == 105
      expect(
        await this.dai.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("105.075"));
      // order id1 was filled and closed, matching order was not filled, thus a new order was created for bob
      expect(
        (await this.mockOrderController.getOrderInfo(id1))[3]
      ).to.be.bignumber.equal(ether("0"));
      const newOrder = await this.mockOrderController.getOrderInfo(id2);
      expect(newOrder[1]).to.be.bignumber.equal(ether("100"));
      expect(newOrder[2]).to.be.bignumber.equal(ether("150"));
      expect(newOrder[3]).to.be.bignumber.equal(ether("70"));
    });

    it("should match 2 orders, alice`s order is 25 tokens to fill", async () => {
      await this.mockOrderController._createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("100"),
        ether("50"),
        alice,
        false,
        { from: alice }
      );
      const id1 = await this.mockOrderController.getOrderId(
        (await this.mockOrderController.getOrderIdLength()) - 1
      );
      await this.mockOrderController.matchOrders(
        [id1],
        this.weth.address,
        this.dai.address,
        ether("100"),
        ether("200"),
        false,
        { from: bob }
      );
      const id2 = await this.mockOrderController.getOrderId(
        (await this.mockOrderController.getOrderIdLength()) - 1
      );
      expect(await this.weth.balanceOf(bob)).to.be.bignumber.equal(
        ether("49.875")
      );
      expect(await this.dai.balanceOf(alice)).to.be.bignumber.equal(
        ether("49.875")
      );
      expect(
        await this.weth.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("0.125"));
      // bob place 100 more weth after matching, thus 100 + 0.075 fee;
      expect(
        await this.dai.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("100.125"));
      // order id1 was filled and closed, matching order was not filled, thus a new order was created for bob
      expect(
        (await this.mockOrderController.getOrderInfo(id1))[3]
      ).to.be.bignumber.equal(ether("0"));
      const newOrder = await this.mockOrderController.getOrderInfo(id2);
      expect(newOrder[1]).to.be.bignumber.equal(ether("100"));
      expect(newOrder[2]).to.be.bignumber.equal(ether("200"));
      expect(newOrder[3]).to.be.bignumber.equal(ether("50"));
    });

    it("should match 2 orders, left is 75 tokens to fill", async () => {
      await this.mockOrderController._createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("100"),
        ether("75"),
        alice,
        false,
        { from: alice }
      );
      const id1 = await this.mockOrderController.getOrderId(
        (await this.mockOrderController.getOrderIdLength()) - 1
      );
      await this.mockOrderController.matchOrders(
        [id1],
        this.weth.address,
        this.dai.address,
        ether("100"),
        ether("150"),
        false,
        { from: bob }
      );
      const id2 = await this.mockOrderController.getOrderId(
        (await this.mockOrderController.getOrderIdLength()) - 1
      );
      expect(await this.weth.balanceOf(bob)).to.be.bignumber.equal(
        ether("74.8125")
      );
      expect(await this.dai.balanceOf(alice)).to.be.bignumber.equal(
        ether("74.8125")
      );
      expect(
        await this.weth.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("0.1875"));
      // bob place 37.5 more weth transfer to contract after matching, thus 120 + 0.075commission;
      expect(
        await this.dai.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("37.6875"));
      // order id1 was filled and closed, matching order was not filled, thus a new order was created for bob
      expect(
        (await this.mockOrderController.getOrderInfo(id1))[3]
      ).to.be.bignumber.equal(ether("0"));
      const newOrder = await this.mockOrderController.getOrderInfo(id2);
      expect(newOrder[1]).to.be.bignumber.equal(ether("100"));
      expect(newOrder[2]).to.be.bignumber.equal(ether("150"));
      expect(newOrder[3]).to.be.bignumber.equal(ether("25"));
    });

    it("should match 2 new orders", async () => {
      await this.orderController.createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("200"),
        { from: alice }
      );
      const id1 = await this.orderController.getOrderId(
        (await this.orderController.getOrderIdLength()) - 1
      );
      await this.orderController.matchOrders(
        [id1],
        this.weth.address,
        this.dai.address,
        ether("1000"),
        ether("1000"),
        false,
        { from: bob }
      );
      const id2 = await this.orderController.getOrderId(
        (await this.orderController.getOrderIdLength()) - 1
      );
      expect(await this.weth.balanceOf(bob)).to.be.bignumber.equal(
        ether("199.5")
      );
      expect(await this.dai.balanceOf(alice)).to.be.bignumber.equal(
        ether("99.75")
      );
      expect(
        await this.weth.balanceOf(this.orderController.address)
      ).to.be.bignumber.equal(ether("0.5"));
      expect(
        await this.dai.balanceOf(this.orderController.address)
      ).to.be.bignumber.equal(ether("800.25"));
      // order id1 was filled and closed, matching order was filled instantly, thus no need to create new order for bob
      // getOrderInfo(id1))[3] => amountLeftToFill
      expect(
        (await this.orderController.getOrderInfo(id1))[3]
      ).to.be.bignumber.equal(ether("0"));
      expect(
        (await this.orderController.getOrderInfo(id2))[3]
      ).to.be.bignumber.equal(ether("800"));
    });

    it("should match multiple orders, new order is sufficient to close old ones", async () => {
      await this.mockOrderController._createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("100"),
        ether("50"),
        alice,
        false,
        { from: alice }
      );
      const id1 = await this.mockOrderController.getOrderId(
        (await this.mockOrderController.getOrderIdLength()) - 1
      );

      await this.mockOrderController._createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("100"),
        ether("50"),
        alice,
        false,
        { from: alice }
      );
      const id2 = await this.mockOrderController.getOrderId(
        (await this.mockOrderController.getOrderIdLength()) - 1
      );

      await this.mockOrderController.matchOrders(
        [id1, id2],
        this.weth.address,
        this.dai.address,
        ether("100"),
        ether("150"),
        false,
        { from: bob }
      );
      const id3 = await this.mockOrderController.getOrderId(
        (await this.mockOrderController.getOrderIdLength()) - 1
      );

      expect(await this.weth.balanceOf(bob)).to.be.bignumber.equal(
        ether("99.75")
      );
      expect(await this.dai.balanceOf(alice)).to.be.bignumber.equal(
        ether("99.75")
      );
      expect(
        await this.weth.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("0.25"));
      expect(
        await this.dai.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("0.25"));
      // order id1 was filled and closed, matching order was filled instantly, thus no need to create new order for bob
      expect(
        (await this.mockOrderController.getOrderInfo(id1))[3]
      ).to.be.bignumber.equal(ether("0"));
      expect(
        (await this.mockOrderController.getOrderInfo(id2))[3]
      ).to.be.bignumber.equal(ether("0"));
      expect(
        (await this.mockOrderController.getOrderInfo(id3))[3]
      ).to.be.bignumber.equal(ether("0"));
    });

    it("should match multiple orders, new order is sufficient to close old ones", async () => {
      await this.mockOrderController._createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("100"),
        ether("30"),
        alice,
        false,
        { from: alice }
      );
      expect(
        await this.weth.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("30"));
      const id1 = await this.mockOrderController.getOrderId(
        (await this.mockOrderController.getOrderIdLength()) - 1
      );

      await this.mockOrderController._createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("100"),
        ether("30"),
        alice,
        false,
        { from: alice }
      );
      expect(
        await this.weth.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("60"));
      const id2 = await this.mockOrderController.getOrderId(
        (await this.mockOrderController.getOrderIdLength()) - 1
      );

      await this.mockOrderController._createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("100"),
        ether("30"),
        alice,
        false,
        { from: alice }
      );
      expect(
        await this.weth.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("90"));
      const id3 = await this.mockOrderController.getOrderId(
        (await this.mockOrderController.getOrderIdLength()) - 1
      );

      await this.mockOrderController.matchOrders(
        [id1, id2, id3],
        this.weth.address,
        this.dai.address,
        ether("100"),
        ether("150"),
        false,
        { from: bob }
      );
      const id4 = await this.mockOrderController.getOrderId(
        (await this.mockOrderController.getOrderIdLength()) - 1
      );

      expect(await this.weth.balanceOf(bob)).to.be.bignumber.equal(
        ether("89.775")
      );
      expect(await this.dai.balanceOf(alice)).to.be.bignumber.equal(
        ether("89.775")
      );
      expect(
        await this.weth.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("0.225"));
      expect(
        await this.dai.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("15.225"));
      // // order id1 was filled and closed, matching order was filled instantly, thus no need to create new order for bob
      expect(
        (await this.mockOrderController.getOrderInfo(id1))[3]
      ).to.be.bignumber.equal(ether("0"));
      expect(
        (await this.mockOrderController.getOrderInfo(id2))[3]
      ).to.be.bignumber.equal(ether("0"));
      expect(
        (await this.mockOrderController.getOrderInfo(id3))[3]
      ).to.be.bignumber.equal(ether("0"));
      const newOrder = await this.mockOrderController.getOrderInfo(id4);
      expect(newOrder[1]).to.be.bignumber.equal(ether("100"));
      expect(newOrder[2]).to.be.bignumber.equal(ether("150"));
      expect(newOrder[3]).to.be.bignumber.equal(ether("10"));
    });

    it("should match multiple orders, new order is not sufficient to close old ones", async () => {
      await this.mockOrderController._createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("100"),
        ether("30"),
        alice,
        false,
        { from: alice }
      );
      expect(
        await this.weth.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("30"));
      const id1 = await this.mockOrderController.getOrderId(
        (await this.mockOrderController.getOrderIdLength()) - 1
      );

      await this.mockOrderController._createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("100"),
        ether("30"),
        alice,
        false,
        { from: alice }
      );
      expect(
        await this.weth.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("60"));
      const id2 = await this.mockOrderController.getOrderId(
        (await this.mockOrderController.getOrderIdLength()) - 1
      );

      await this.mockOrderController._createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("100"),
        ether("50"),
        alice,
        false,
        { from: alice }
      );
      expect(
        await this.weth.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("110"));
      const id3 = await this.mockOrderController.getOrderId(
        (await this.mockOrderController.getOrderIdLength()) - 1
      );

      await this.mockOrderController.matchOrders(
        [id1, id2, id3],
        this.weth.address,
        this.dai.address,
        ether("100"),
        ether("150"),
        false,
        { from: bob }
      );
      const id4 = await this.mockOrderController.getOrderId(
        (await this.mockOrderController.getOrderIdLength()) - 1
      );

      expect(await this.weth.balanceOf(bob)).to.be.bignumber.equal(
        ether("99.75")
      );
      expect(await this.dai.balanceOf(alice)).to.be.bignumber.equal(
        ether("99.75")
      );
      expect(
        await this.weth.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("10.25"));
      expect(
        await this.dai.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("0.25"));
      // check that orders id1, id2, and new id4 were closed
      expect(
        (await this.mockOrderController.getOrderInfo(id1))[3]
      ).to.be.bignumber.equal(ether("0"));
      expect(
        (await this.mockOrderController.getOrderInfo(id2))[3]
      ).to.be.bignumber.equal(ether("0"));
      expect(
        (await this.mockOrderController.getOrderInfo(id4))[3]
      ).to.be.bignumber.equal(ether("0"));
      const newOrder = await this.mockOrderController.getOrderInfo(id3);
      expect(newOrder[1]).to.be.bignumber.equal(ether("100"));
      expect(newOrder[2]).to.be.bignumber.equal(ether("100"));
      expect(newOrder[3]).to.be.bignumber.equal(ether("10"));
    });

    it("should match multiple orders, new order is not sufficient to close old ones", async () => {
      await this.mockOrderController._createOrder(
        this.dai.address,
        this.weth.address,
        ether("1000"),
        ether("10"),
        ether("300"),
        alice,
        false,
        { from: alice }
      );
      expect(
        await this.weth.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("3"));
      const id1 = await this.mockOrderController.getOrderId(
        (await this.mockOrderController.getOrderIdLength()) - 1
      );

      await this.mockOrderController._createOrder(
        this.dai.address,
        this.weth.address,
        ether("1000"),
        ether("10"),
        ether("300"),
        alice,
        false,
        { from: alice }
      );
      expect(
        await this.weth.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("6"));
      const id2 = await this.mockOrderController.getOrderId(
        (await this.mockOrderController.getOrderIdLength()) - 1
      );

      await this.mockOrderController._createOrder(
        this.dai.address,
        this.weth.address,
        ether("1000"),
        ether("10"),
        ether("500"),
        alice,
        false,
        { from: alice }
      );
      expect(
        await this.weth.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("11"));
      const id3 = await this.mockOrderController.getOrderId(
        (await this.mockOrderController.getOrderIdLength()) - 1
      );

      await this.mockOrderController.matchOrders(
        [id1, id2, id3],
        this.weth.address,
        this.dai.address,
        ether("10"),
        ether("1000"),
        false,
        { from: bob }
      );
      const id4 = await this.mockOrderController.getOrderId(
        (await this.mockOrderController.getOrderIdLength()) - 1
      );

      expect(await this.weth.balanceOf(bob)).to.be.bignumber.equal(
        ether("9.975")
      );
      expect(await this.dai.balanceOf(alice)).to.be.bignumber.equal(
        ether("997.5")
      );
      expect(
        await this.weth.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("1.025"));
      expect(
        await this.dai.balanceOf(this.mockOrderController.address)
      ).to.be.bignumber.equal(ether("2.5"));
      // check that orders id1, id2, and new id4 were closed
      expect(
        (await this.mockOrderController.getOrderInfo(id1))[3]
      ).to.be.bignumber.equal(ether("0"));
      expect(
        (await this.mockOrderController.getOrderInfo(id2))[3]
      ).to.be.bignumber.equal(ether("0"));
      expect(
        (await this.mockOrderController.getOrderInfo(id4))[3]
      ).to.be.bignumber.equal(ether("0"));
      const newOrder = await this.mockOrderController.getOrderInfo(id3);
      expect(newOrder[1]).to.be.bignumber.equal(ether("1000"));
      expect(newOrder[2]).to.be.bignumber.equal(ether("10"));
      expect(newOrder[3]).to.be.bignumber.equal(ether("100"));
    });
  });

  describe("match should fail", async () => {
    it("should fail because 1 or 2 zero address provided", async () => {
      await this.orderController.createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("100"),
        { from: alice }
      );
      const id1 = await this.orderController.getOrderId(
        (await this.orderController.getOrderIdLength()) - 1
      );
      await expectRevert(
        this.orderController.matchOrders(
          [id1],
          ZERO_ADDRESS,
          this.dai.address,
          ether("100"),
          ether("100"),
          false,
          { from: bob }
        ),
        "OC:BAD_TOKEN_MATCH"
      );
      await expectRevert(
        this.orderController.matchOrders(
          [id1],
          this.weth.address,
          ZERO_ADDRESS,
          ether("100"),
          ether("100"),
          false,
          { from: bob }
        ),
        "OC:BAD_TOKEN_MATCH"
      );
      await expectRevert(
        this.orderController.matchOrders(
          [id1],
          ZERO_ADDRESS,
          ZERO_ADDRESS,
          ether("100"),
          ether("100"),
          false,
          { from: bob }
        ),
        "OC:BAD_TOKEN_MATCH"
      );
    });

    it("should fail because 1 or 2 token addresses are not matching", async () => {
      const dai2 = await Mock.new("DAI", "DAI", ether("1000000"));
      const weth2 = await Mock.new("DAI", "DAI", ether("1000000"));
      await this.orderController.createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("100"),
        { from: alice }
      );
      const id1 = await this.orderController.getOrderId(
        (await this.orderController.getOrderIdLength()) - 1
      );
      await expectRevert(
        this.orderController.matchOrders(
          [id1],
          this.weth.address,
          dai2.address,
          ether("100"),
          ether("100"),
          false,
          { from: bob }
        ),
        "OC:BAD_TOKEN_MATCH"
      );
      await expectRevert(
        this.orderController.matchOrders(
          [id1],
          weth2.address,
          this.dai.address,
          ether("100"),
          ether("100"),
          false,
          { from: bob }
        ),
        "OC:BAD_TOKEN_MATCH"
      );
      await expectRevert(
        this.orderController.matchOrders(
          [id1],
          weth2.address,
          dai2.address,
          ether("100"),
          ether("100"),
          false,
          { from: bob }
        ),
        "OC:BAD_TOKEN_MATCH"
      );
    });

    it("should fail because incorrect price match", async () => {
      await this.orderController.createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("100"),
        { from: alice }
      );
      const id1 = await this.orderController.getOrderId(
        (await this.orderController.getOrderIdLength()) - 1
      );
      await expectRevert(
        this.orderController.matchOrders(
          [id1],
          this.weth.address,
          this.dai.address,
          ether("100"),
          ether("50"),
          false,
          { from: bob }
        ),
        "OC:BAD_PRICE_MATCH"
      );
    });
  });

  describe("check cancel function", async () => {
    it("should cancel order", async () => {
      expect(await this.weth.balanceOf(alice)).to.be.bignumber.equal(
        ether("1000000")
      );
      expect(
        await this.weth.balanceOf(this.orderController.address)
      ).to.be.bignumber.equal(ether("0"));
      await this.orderController.createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("100"),
        { from: alice }
      );
      const id1 = await this.orderController.getOrderId(
        (await this.orderController.getOrderIdLength()) - 1
      );
      expect(await this.weth.balanceOf(alice)).to.be.bignumber.equal(
        ether("999900")
      );
      expect(
        await this.weth.balanceOf(this.orderController.address)
      ).to.be.bignumber.equal(ether("100"));
      expect((await this.orderController.getOrderInfo(id1))[8]).to.equal(false);
      await this.orderController.cancelOrder(id1, { from: alice });
      expect((await this.orderController.getOrderInfo(id1))[8]).to.equal(true);
      expect(await this.weth.balanceOf(alice)).to.be.bignumber.equal(
        ether("1000000")
      );
      expect(
        await this.weth.balanceOf(this.orderController.address)
      ).to.be.bignumber.equal(ether("0"));
    });
    it("should fail to cancel order", async () => {
      expect(await this.weth.balanceOf(alice)).to.be.bignumber.equal(
        ether("1000000")
      );
      expect(
        await this.weth.balanceOf(this.orderController.address)
      ).to.be.bignumber.equal(ether("0"));
      await this.orderController.createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("100"),
        { from: alice }
      );
      const id1 = await this.orderController.getOrderId(
        (await this.orderController.getOrderIdLength()) - 1
      );
      expect(await this.weth.balanceOf(alice)).to.be.bignumber.equal(
        ether("999900")
      );
      expect(
        await this.weth.balanceOf(this.orderController.address)
      ).to.be.bignumber.equal(ether("100"));
      expect((await this.orderController.getOrderInfo(id1))[8]).to.equal(false);
      await expectRevert(
        this.orderController.cancelOrder(id1, { from: bob }),
        "OC:NOT_AUTHORIZED"
      );
      expect((await this.orderController.getOrderInfo(id1))[8]).to.equal(false);
      expect(await this.weth.balanceOf(alice)).to.be.bignumber.equal(
        ether("999900")
      );
      expect(
        await this.weth.balanceOf(this.orderController.address)
      ).to.be.bignumber.equal(ether("100"));
    });
  });

  describe("check userId mapping update", async () => {
    it("should cancel order", async () => {
      await this.orderController.createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("100"),
        { from: alice }
      );
      const id1 = await this.orderController.getOrderId(
        (await this.orderController.getOrderIdLength()) - 1
      );
      expect(
        (await this.orderController.getUserOrderIds(0, 1000, { from: alice }))
          .length
      ).to.equal(1);

      await this.orderController.createOrder(
        this.dai.address,
        this.weth.address,
        ether("100"),
        ether("100"),
        { from: alice }
      );
      const id2 = await this.orderController.getOrderId(
        (await this.orderController.getOrderIdLength()) - 1
      );
      const aliceOrderIds = await this.orderController.getUserOrderIds(
        0,
        1000,
        { from: alice }
      );
      expect(aliceOrderIds.length).to.equal(2);
      expect(aliceOrderIds[0]).to.be.bignumber.equal(id1);
      expect(aliceOrderIds[1]).to.be.bignumber.equal(id2);
    });
  });

  describe("check order fees", () => {
    it("fees should be zero at order creation", async () => {
      await this.orderController.createOrder(
        this.dai.address,
        this.weth.address,
        ether("1000"),
        ether("1"),
        { from: alice }
      );
      const id1 = await this.orderController.getOrderId(
        (await this.orderController.getOrderIdLength()) - 1
      );
      const order1 = await this.orderController.getOrderInfo(id1);
      expect(order1[4]).to.be.bignumber.equal(ZERO);
    });

    it("should sum and store order fees", async () => {
      await this.orderController.createOrder(
        this.dai.address,
        this.weth.address,
        ether("10000"),
        ether("10"),
        { from: alice }
      );
      const id1 = await this.orderController.getOrderId(
        (await this.orderController.getOrderIdLength()) - 1
      );
      let orderFees = ZERO;
      const expectedFee = ether("1000").mul(new BN("25")).div(new BN("10000"));
      for (let i = 0; i < 5; i += 1) {
        const match = await this.orderController.matchOrders(
          [id1],
          this.weth.address,
          this.dai.address,
          ether("1"),
          ether("10000"),
          true,
          { from: bob }
        );
        orderFees = orderFees.add(expectedFee);
        const order1 = await this.orderController.getOrderInfo(id1);
        expectEvent(match, "OrderUpdated", {
          id: order1[0],
          amountA: order1[1],
          amountB: order1[2],
          amountLeftToFill: order1[3],
          tokenA: order1[5],
          tokenB: order1[6],
          user: order1[7],
          isMarket: false,
          fee: orderFees,
        });

        expect(order1[4]).to.be.bignumber.equal(orderFees);

        const expectedIdNFees = ether("1")
          .mul(new BN("25"))
          .div(new BN("10000"));
        const idN = await this.orderController.getOrderId(
          (await this.orderController.getOrderIdLength()) - 1
        );
        const orderN = await this.orderController.getOrderInfo(idN);
        expect(orderN[4]).to.be.bignumber.equal(expectedIdNFees);

        expectEvent(match, "OrderUpdated", {
          id: orderN[0],
          amountA: orderN[1],
          amountB: orderN[2],
          amountLeftToFill: orderN[3],
          tokenA: orderN[5],
          tokenB: orderN[6],
          user: orderN[7],
          isMarket: true,
          fee: expectedIdNFees,
        });
      }
    });
  });

  describe("order overmatching", () => {
    it("should not match with additional orders if order finished", async () => {
      const orderIDs = [];
      for (let i = 0; i < 10; i++) {
        await this.orderController.createOrder(
          this.dai.address,
          this.weth.address,
          ether("2000"),
          ether("2"),
          { from: alice }
        );
        orderIDs.push(
          await this.orderController.getOrderId(
            (await this.orderController.getOrderIdLength()) - 1
          )
        );
      }

      const match = await this.orderController.matchOrders(
        orderIDs,
        this.weth.address,
        this.dai.address,
        ether("10"),
        ether("10000"),
        true,
        { from: bob }
      );
      const orderUpdatedEvents = match.receipt.logs.filter(
        (l) => l.event === "OrderUpdated"
      );
      console.log("OrderUpdated events count:", orderUpdatedEvents.length);
      await processEventsArgs(match.receipt, "OrderUpdated", async (args) => {
        console.log(args.fee.toString());
        await expect(args.fee.toString()).to.be.not.equal("0");
      });
    });
  });

  describe.only("empty orders", () => {
    it("should reproduce bug", async () => {
      await this.orderController.createOrder(
        this.dai.address,
        this.weth.address,
        new BN("1000000"),
        new BN("1000000000000000000"),
        { from: alice }
      );
      const matchingOrderID = await this.orderController.getOrderId(
        (await this.orderController.getOrderIdLength()) - 1
      );

      await this.orderController.matchOrders(
        [matchingOrderID],
        this.weth.address,
        this.dai.address,
        new BN("500000000000000000"),
        new BN("50000000"),
        true,
        { from: bob }
      );

      await this.orderController.cancelOrder(matchingOrderID, { from: alice });
      console.log(`Matching orderID: ${matchingOrderID}`);

      const match = await this.orderController.matchOrders(
        [matchingOrderID],
        this.weth.address,
        this.dai.address,
        new BN("10000000"),
        new BN("100000000"),
        true,
        { from: bob }
      );

      match.receipt.logs.map((l) => console.log(l.event));
      await processEventsArgs(match.receipt, "OrderCreated", async (args) => {
        console.group(`OrderCreated: ${args.id.toString()}`);
        console.log(args.amountA.toString());
        console.log(args.amountB.toString());
        console.log(args.tokenA);
        console.log(args.tokenB);
        console.log(`Is market: ${args.isMarket}`);
        console.groupEnd();
      });
      await processEventsArgs(match.receipt, "OrderUpdated", async (args) => {
        console.group(`OrderUpdated: ${args.id.toString()}`);
        console.log(args.amountA.toString());
        console.log(args.amountB.toString());
        console.log(args.tokenA);
        console.log(args.tokenB);
        console.log(args.amountLeftToFill.toString());
        console.log(`Is market: ${args.isMarket}`);
        console.groupEnd();
      });
    });
  });

  // // takes 10 mins
  // describe('create 1100 order to check getUserOrderIds pagination', async () => {
  //   it('should update user order ids', async () => {
  //     for (let i = 0; i < 1000; i++) {
  //       await this.orderController.createOrder(this.dai.address, this.weth.address, ether('1'), ether('1'), { from: alice });
  //     }
  //     expect((await this.orderController.getUserOrderIds(0, 1000, { from: alice })).length).to.equal(1000);
  //     for (let i = 0; i < 100; i++) {
  //       await this.orderController.createOrder(this.dai.address, this.weth.address, ether('100'), ether('100'), { from: alice });
  //     }
  //     expect((await this.orderController.getUserOrderIds(1000, 100, { from: alice })).length).to.equal(100);
  //     expect((await this.orderController.getUserOrderIds(100, 1000, { from: alice })).length).to.equal(1000);
  //     expect((await this.orderController.getUserOrderIds(0, 1100, { from: alice })).length).to.equal(1110);
  //   });
  // });
});
