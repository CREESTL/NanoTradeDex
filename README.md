arrow-dex-sc Contract
=================

**Requirements** 

 - nodeJS v10.19.0 or later
- npm 6.14.10 or later
- Truffle v5.1.62 (core: 5.1.62) or later

**Installation**

- npm i
- yarn

**Run tests**

- npm run lint
- npm run test

**Make Flattened contract file**

- npm run flatten

**Deployment**

*Testnet*

RINKEBY ETHEREUM: `yarn deploy rinkeby`

BINANCE TESTNET: `yarn deploy bscTestnet`

TRON: `yarn deploy-tron`

*Mainnet*

ETHEREUM MAINNET: `yarn deploy ethereum`

BINANCE MAINNET: `yarn deploy bscMainnet`

TRON: not implemented yet, please use the 
https://tronscan.org/#/contracts/contract-compiler
to compile and deploy contract
You will need to flatten contract first. (see Manual deployment section) 

*Manual (web) deployment*

In order to deploy and verify manually you need to upload 
a flattened contract to the 
https://shasta.tronscan.org/#/contracts/contract-compiler

To obtain the flattened contract first build (e.g. `yarn build`)
and then flatten it `yarn flatten`

**Smart contract verification**

To verify TRON contracts use the tronscan:

SHASTA testnet: https://shasta.tronscan.org/#/contracts/verify

MAINNET: https://tronscan.org/#/contracts/verify

*TESTNET*:

*ETHEREUM RINKEBY*: yarn verify all rinkeby

*BINANCE TESTNET*: yarn verify all bscTestnet

*MAINNET*:

*ETHEREUM MAINNET*: yarn verify all ethereum 

*BINANCE MAINNET*: yarn verify all bscMainnet
