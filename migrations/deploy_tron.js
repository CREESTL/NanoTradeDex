// var web3 = require('ethereum.js');
// const solc = require('solc');

const fs = require('fs');
require('dotenv').config();
const b58c = require('bs58check');

const TronWeb = require('tronweb');
const HttpProvider = TronWeb.providers.HttpProvider;
const fullNode = new HttpProvider("https://api.shasta.trongrid.io");
const solidityNode = new HttpProvider("https://api.shasta.trongrid.io");
const eventServer = "https://api.shasta.trongrid.io";

const privateKey = process.env.TRON_PRIVATE_KEY;

const tronWeb = new TronWeb(fullNode, solidityNode, eventServer, privateKey);

//const tsdk = new TronStation(tronWeb, true);

async function logInfo() {
    console.log(' --- info --- ');
    const balance = await tronWeb.trx.getBalance(process.env.TRON_DEPLOYER_ACCOUNT);
    const bw = await tronWeb.trx.getBandwidth(process.env.TRON_DEPLOYER_ACCOUNT);
    console.log('account balance', balance);
    console.log('account bandwidth', bw);
}
logInfo().then(() => {console.log(' --- info --- ')});

const artifactContent = JSON.parse(fs.readFileSync(
    'build/contracts/OrderController.json', {encoding : 'utf8', flag : 'r'}));

const abi = artifactContent.abi;
const bytecode = artifactContent.bytecode;

const feeRate = 25; // OrderController's constructor param

async function deployContract(contractName, params, abi, bytecode) {
  const transaction = await tronWeb.transactionBuilder.createSmartContract(
      {
        name : contractName,
        issuerAddress : process.env.DEPLOYER_ACCOUNT,
        abi : abi,
        bytecode : bytecode,
        feeLimit : 1e9,
        callValue : 0,
        userFeePercentage : 100, // user pays all energy costs, not contract
        originEnergyLimit : 1e7,
        parameters : params,
        visible: true // address in base58
      },
      tronWeb.defaultAddress.base58
  );

  var signedTransaction = await tronWeb.trx.sign(transaction, privateKey);
  var contractInstance = await tronWeb.trx.sendRawTransaction(
      signedTransaction = signedTransaction);

  return contractInstance;
};


// =============================== real deployment ===============================
// declare contract parameters
const params = [ feeRate.toString() ];

// deploy and log contract and tx info
deployContract('OrderController', params, abi, bytecode).catch(console.error).then(
    async (instance) => {
      if (!instance || !instance.result) {
        console.log('create smart contract failed!');
        return;
      }

      const {txid, transaction} = instance;
      const contractAddress = transaction.contract_address;
      console.log('transaction id', txid);
      console.log('contract address', contractAddress);
      console.log('tx signature', transaction.signature);

//      const txInfo = await tronWeb.trx.getTransactionInfo(txid);
//      console.log(txInfo);

      if (contractAddress !== 'undefined') {
        console.log('contract deployed successfully!');
        console.log('base58 contract address', b58c.encode(Buffer.from(contractAddress, 'hex')));
      } else {
        console.log('failed to deploy smart contract!');
      }
    }
);
