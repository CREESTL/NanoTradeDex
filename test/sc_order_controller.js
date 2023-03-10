/* eslint-disable no-underscore-dangle */
/* eslint-disable max-len */
const { BN, ether } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const MockOrderController = artifacts.require('MockOrderController');
const OrderController = artifacts.require('OrderController');

const FiatTokenV2 = artifacts.require('FiatTokenV2'); // USDC
const TetherToken = artifacts.require('TetherToken'); // USDT
const WBTC = artifacts.require('WBTC'); // WBTC
const Mock = artifacts.require('MockERC20');

const usd = (n) => new BN(web3.utils.toWei(n, 'Mwei')); // decimals 6
const btc = (n) => (new BN(web3.utils.toWei(n, 'Gwei'))).div(new BN('10')); // decimals 8

contract('OrdersController', ([owner, alice, bob]) => {
  beforeEach(async () => {
    this.mockOrderController = await MockOrderController.new(25, { from: owner });
    this.orderController = await OrderController.new(25, { from: owner });
    this.dai = await Mock.new('DAI', 'DAI', ether('100000000000'), { from: alice });

    // deploy and configure USDT
    this.usdt = await TetherToken.new(usd('1000000'), 'Tether USD', 'USDT', 6);

    // deploy and configure USDC
    this.usdc = await FiatTokenV2.new({ from: bob });
    await this.usdc.initialize('USD Coin', 'USDC', 'USD', 6, bob, bob, bob, bob, { from: bob });
    await this.usdc.configureMinter(bob, usd('1000000'), { from: bob });
    await this.usdc.mint(bob, usd('1000000'), { from: bob });

    // deploy and configure WBTC
    this.wbtc = await WBTC.new({ from: alice });
    await this.wbtc.mint(alice, btc('1000000'), { from: alice });

    // await this.usdt.approve(this.mockOrderController.address, new BN('1000000'));
    await this.usdc.approve(this.mockOrderController.address, usd('50000'), { from: bob });
    await this.wbtc.approve(this.mockOrderController.address, btc('10'), { from: alice });
    await this.usdt.approve(this.mockOrderController.address, usd('50000'));

    await this.usdc.approve(this.orderController.address, usd('50000'), { from: bob });
    await this.wbtc.approve(this.orderController.address, btc('10'), { from: alice });
    await this.dai.approve(this.orderController.address, ether('100000000000'), { from: alice });
  });

  it('check fee in events', async () => {
    await this.orderController.createOrder(this.dai.address, this.usdc.address, ether('1'), usd('100'), { from: bob });
    const id1 = await this.orderController.getOrderId((await this.orderController.getOrderIdLength()) - 1);

    await this.orderController.createOrder(this.dai.address, this.usdc.address, ether('1'), usd('100'), { from: bob });
    const id2 = await this.orderController.getOrderId((await this.orderController.getOrderIdLength()) - 1);

    await this.orderController.createOrder(this.dai.address, this.usdc.address, ether('1'), usd('100'), { from: bob });
    const id3 = await this.orderController.getOrderId((await this.orderController.getOrderIdLength()) - 1);

    const matchHash = await this.orderController.matchOrders([id1, id2, id3], this.usdc.address, this.dai.address, usd('250'), ether('2.5'), false, { from: alice });
    const id4 = await this.orderController.getOrderId((await this.orderController.getOrderIdLength()) - 1);
    console.log(matchHash.logs[1].args.fee.toString());
    // expect(matchHash.logs[1].args.fee).to.be.bignumber.equal(usd('25'));
    console.log(matchHash.logs[2].args.fee.toString());
    // expect(matchHash.logs[2].args.fee).to.be.bignumber.equal(usd('25'));
    console.log(matchHash.logs[3].args.fee.toString());
    // expect(matchHash.logs[3].args.fee).to.be.bignumber.equal(usd('12.5'));
    console.log(matchHash.logs[4].args.fee.toString());
    // expect(matchHash.logs[4].args.fee).to.be.bignumber.equal(btc('0.00625'));

    console.log((await this.dai.balanceOf(bob)).toString());
    console.log((await this.usdc.balanceOf(alice)).toString());

    // expect(await this.usdc.balanceOf(alice)).to.be.bignumber.equal(usd('24937.5'));
    // expect(await this.wbtc.balanceOf(bob)).to.be.bignumber.equal(btc('2.49375'));
  });

  it('real test case check', async () => {
    await this.orderController.createOrder(this.dai.address, this.usdc.address, ether('1'), usd('99.9'), { from: bob });
    const id1 = await this.orderController.getOrderId((await this.orderController.getOrderIdLength()) - 1);

    await this.orderController.createOrder(this.dai.address, this.usdc.address, ether('1'), usd('99.8'), { from: bob });
    const id2 = await this.orderController.getOrderId((await this.orderController.getOrderIdLength()) - 1);

    await this.orderController.createOrder(this.dai.address, this.usdc.address, ether('1'), usd('99.7'), { from: bob });
    const id3 = await this.orderController.getOrderId((await this.orderController.getOrderIdLength()) - 1);

    const matchHash = await this.orderController.matchOrders([id1, id2, id3], this.usdc.address, this.dai.address, usd('300'), ether('3'), true, { from: alice });
    const id4 = await this.orderController.getOrderId((await this.orderController.getOrderIdLength()) - 1);
  });

  // it('check createOrder wbtc-usdc', async () => {
  //   await this.mockOrderController._createOrder(this.wbtc.address, this.usdc.address, btc('1'), usd('10000'), btc('1'), bob, false, { from: bob });
  //   expect(await this.usdc.balanceOf(this.mockOrderController.address)).to.be.bignumber.equal(usd('10000'));
  //   const id1 = await this.mockOrderController.getOrderId((await this.mockOrderController.getOrderIdLength()) - 1);
  //   const matchHash = await this.mockOrderController.matchOrders([id1], this.usdc.address, this.wbtc.address, usd('10000'), btc('1'), false, { from: alice });
  //   const id2 = await this.mockOrderController.getOrderId((await this.mockOrderController.getOrderIdLength()) - 1);
  //   expect(matchHash.logs[1].args.fee).to.be.bignumber.equal(usd('25'));
  //   expect(matchHash.logs[2].args.fee).to.be.bignumber.equal(btc('0.0025'));
  //   expect(await this.usdc.balanceOf(alice)).to.be.bignumber.equal(usd('9975'));
  //   expect(await this.wbtc.balanceOf(bob)).to.be.bignumber.equal(btc('0.9975'));
  //   expect(await this.usdc.balanceOf(this.mockOrderController.address)).to.be.bignumber.equal(usd('25'));
  //   expect(await this.wbtc.balanceOf(this.mockOrderController.address)).to.be.bignumber.equal(btc('0.0025'));
  //   expect((await this.mockOrderController.getOrderInfo(id1))[3]).to.be.bignumber.equal(new BN('0'));
  //   expect((await this.mockOrderController.getOrderInfo(id2))[3]).to.be.bignumber.equal(new BN('0'));
  // });

  // it('check createOrder wbtc-usdt', async () => {
  //   await this.mockOrderController._createOrder(this.wbtc.address, this.usdt.address, btc('1'), usd('10000'), btc('1'), owner, false);
  //   expect(await this.usdt.balanceOf(this.mockOrderController.address)).to.be.bignumber.equal(usd('10000'));
  //   const id1 = await this.mockOrderController.getOrderId((await this.mockOrderController.getOrderIdLength()) - 1);
  //   await this.mockOrderController.matchOrders([id1], this.usdt.address, this.wbtc.address, usd('10000'), btc('1'), false, { from: alice });
  //   const id2 = await this.mockOrderController.getOrderId((await this.mockOrderController.getOrderIdLength()) - 1);
  //   expect(await this.usdt.balanceOf(alice)).to.be.bignumber.equal(usd('9975'));
  //   expect(await this.wbtc.balanceOf(owner)).to.be.bignumber.equal(btc('0.9975'));
  //   expect(await this.usdt.balanceOf(this.mockOrderController.address)).to.be.bignumber.equal(usd('25'));
  //   expect(await this.wbtc.balanceOf(this.mockOrderController.address)).to.be.bignumber.equal(btc('0.0025'));
  //   expect((await this.mockOrderController.getOrderInfo(id1))[3]).to.be.bignumber.equal(new BN('0'));
  //   expect((await this.mockOrderController.getOrderInfo(id2))[3]).to.be.bignumber.equal(new BN('0'));
  // });

  // it('check createOrder usdc-usdt', async () => {
  //   await this.mockOrderController._createOrder(this.usdt.address, this.usdc.address, usd('1'), usd('10000'), usd('1'), bob, false, { from: bob });
  //   expect(await this.usdc.balanceOf(this.mockOrderController.address)).to.be.bignumber.equal(usd('10000'));
  //   const id1 = await this.mockOrderController.getOrderId((await this.mockOrderController.getOrderIdLength()) - 1);
  //   await this.mockOrderController.matchOrders([id1], this.usdc.address, this.usdt.address, usd('10000'), usd('1'), false, { from: owner });
  //   const id2 = await this.mockOrderController.getOrderId((await this.mockOrderController.getOrderIdLength()) - 1);
  //   expect(await this.usdt.balanceOf(bob)).to.be.bignumber.equal(usd('0.9975'));
  //   expect(await this.usdc.balanceOf(owner)).to.be.bignumber.equal(usd('9975'));
  //   expect(await this.usdt.balanceOf(this.mockOrderController.address)).to.be.bignumber.equal(usd('0.0025'));
  //   expect(await this.usdc.balanceOf(this.mockOrderController.address)).to.be.bignumber.equal(usd('25'));
  //   expect((await this.mockOrderController.getOrderInfo(id1))[3]).to.be.bignumber.equal(new BN('0'));
  //   expect((await this.mockOrderController.getOrderInfo(id2))[3]).to.be.bignumber.equal(new BN('0'));
  // });

  // it('check match order with amountB greater than acc has', async () => {
  //   await this.mockOrderController._createOrder(this.usdt.address, this.usdc.address, usd('1'), usd('1'), usd('1'), bob, false, { from: bob });
  //   expect(await this.usdc.balanceOf(this.mockOrderController.address)).to.be.bignumber.equal(usd('1'));
  //   const id1 = await this.mockOrderController.getOrderId((await this.mockOrderController.getOrderIdLength()) - 1);
  //   await expectRevert(
  //     this.mockOrderController.matchOrders(
  //       [id1],
  //       this.usdc.address,
  //       this.usdt.address,
  //       usd('1'),
  //       usd('100000000000000000'),
  //       false,
  //       { from: owner },
  //     ),
  //     'OC: BAD MATCH',
  //   );
  // });
});
