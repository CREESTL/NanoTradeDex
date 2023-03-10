# arrow-dex-sc Contract

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

_Testnet_

RINKEBY ETHEREUM: `yarn deploy rinkeby`

BINANCE TESTNET: `yarn deploy bscTestnet`

TRON: `yarn deploy-tron`

_Mainnet_

ETHEREUM MAINNET: `yarn deploy ethereum`

BINANCE MAINNET: `yarn deploy bscMainnet`

TRON: not implemented yet, please use the
https://tronscan.org/#/contracts/contract-compiler
to compile and deploy contract
You will need to flatten contract first. (see Manual deployment section)

_Manual (web) deployment_

In order to deploy and verify manually you need to upload
a flattened contract to the
https://shasta.tronscan.org/#/contracts/contract-compiler

To obtain the flattened contract first build (e.g. `yarn build`)
and then flatten it `yarn flatten`

**Smart contract verification**

To verify TRON contracts use the tronscan:

SHASTA testnet: https://shasta.tronscan.org/#/contracts/verify

MAINNET: https://tronscan.org/#/contracts/verify

_TESTNET_:

_ETHEREUM RINKEBY_: yarn verify all rinkeby

_BINANCE TESTNET_: yarn verify all bscTestnet

_MAINNET_:

_ETHEREUM MAINNET_: yarn verify all ethereum

_BINANCE MAINNET_: yarn verify all bscMainnet
