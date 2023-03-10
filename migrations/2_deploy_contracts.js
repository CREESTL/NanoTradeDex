const OrderController = artifacts.require('OrderController');

module.exports = function (deployer) {
  deployer.then(async () => {
    await deployer.deploy(OrderController, 25);
  });
};
