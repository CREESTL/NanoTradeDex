const { BN, ether, expectRevert } = require("@openzeppelin/test-helpers");

const revertToSnapShot = (id) =>
  new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "evm_revert",
        params: [id],
        id: new Date().getTime(),
      },
      (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result);
      }
    );
  });

const takeSnapshot = () =>
  new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "evm_snapshot",
        id: new Date().getTime(),
      },
      (err, snapshotId) => {
        if (err) {
          return reject(err);
        }
        return resolve(snapshotId);
      }
    );
  });

/* eslint-disable */
const compactView = (value_BN) =>
  web3.utils.fromWei(value_BN.toString(), "ether");
const Ether = (value_str) => new BN(web3.utils.toWei(value_str, "ether"));
const newBN = (value_str = "1.0") =>
  new BN(web3.utils.toWei(value_str, "ether"));
/* eslint-enable */

const processEventArgs = async (result, eventName, processArgs) => {
  if (result == null) {
    throw new Error(`Result of tx is: ${result}`);
  }
  const filteredLogs = result.logs.filter((l) => l.event === eventName);
  const eventArgs = filteredLogs[0].args;
  await processArgs(eventArgs);
};

const processEventsArgs = async (result, eventName, processArgs) => {
  if (result == null) {
    throw new Error(`Result of tx is: ${result}`);
  }
  const filteredLogs = result.logs.filter((l) => l.event === eventName);
  // eslint-disable-next-line no-restricted-syntax
  for (const log of filteredLogs) {
    // eslint-disable-next-line no-await-in-loop
    await processArgs(log.args);
  }
};

const checkSetter = async (
  setterMethodName,
  getterName,
  newValue,
  validSender,
  nonValidSender,
  contractInstance,
  revertMessage
) => {
  await contractInstance[setterMethodName](newValue, { from: validSender });
  expect(await contractInstance[getterName]()).to.be.equal(newValue);
  await expectRevert(
    contractInstance[setterMethodName](newValue, { from: nonValidSender }),
    revertMessage
  );
};

module.exports = {
  DAY: 86400,
  HOUR: 3600,
  ZERO: new BN("0"),
  ONE: new BN("1"),
  CONVERSION_WEI_CONSTANT: ether("1"),
  processEventArgs,
  processEventsArgs,
  checkSetter,
  revertToSnapShot,
  takeSnapshot,
};
