# Benture Smart-Contracts

The Benture is an investing marketplace, connecting entrepreneurs with investors. The Benture combines the token creation and management, launchpad and DEX features, providing entrepreneurs a single solution that makes it simple, quick and cost effective to find and interact with investors and shareholders.

#### Table on contents

[Prereqiusites](#preqs)  
[Build](#build)  
[Test](#test)  
[Run scripts](#run)  
[Deploy](#deploy)  
[Networks](#networks)  
[Wallets](#wallets)  
[Smart Contract Logic](#logic)  
[-- BentureDex](#dex)  
[Structure of Deploy Output File](#output)  
[[Known Issues]](#issues)

<a name="preqs"/>

### Prerequisites

- Install [Git](https://git-scm.com/)
- Install [Node.js](https://nodejs.org/en/download/)
- Clone this repository with `git clone https://git.sfxdx.ru/nano-trade/nano-trade-sc.git`
- Navigate to the directory with the cloned code
- Install [Hardhat](https://hardhat.org/) with `npm install --save-dev hardhat`
- Install all required dependencies with `npm install`
- Create a file called `.env` in the root of the project with the same contents as `.env.example`
- Create an account on [Polygonscan](https://polygonscan.com/). Go to `Account -> API Keys`. Create a new API key. Copy it to `.env` file
  ```
  POLYGONSCAN_API_KEY=<your polygonscan API key>
  ```
- Copy your wallet's private key (see [Wallets](#wallets)) to `.env` file

  ```
  ACC_PRIVATE_KEY=<your private key>
  ```

  :warning:**DO NOT SHARE YOUR .env FILE IN ANY WAY OR YOU RISK TO LOSE ALL YOUR FUNDS**:warning:

<a name="build"/>

### Build

```
npx hardhat compile
```

<a name="test"/>

### Test

```
npx hardhat test
```

<a name="run"/>

### Run Scripts

```
npx hardhat run <script file name here> --network <network name here>
```

<a name="deploy"/>

### Deploy

```
npx hardhat run scripts/deploy.js --network <network name here>
```

Deployment script takes about 5 minutes to complete. Please, be patient!
After the contracts get deployed you can find their _addresses_ and code verification _URLs_ in the `scripts/deployOutput.json` file (see [Structure of Deploy Output File](#output)).  
Note that this file only refreshes the addresses of contracts that have been successfully deployed (or redeployed). If you deploy only a single contract then its address would get updated and all other addresses would remain untouched and would link to _old_ contracts.  
Please, **do not** write anything to `deployOutput.json` file yourself! It is a read-only file.  
All deployed contracts _are verified_ on [Polygonscan](https://mumbai.polygonscan.com/).

<a name="networks"/>

### Networks

а) **Polygon test** network  
Make sure you have _enough test MATIC tokens_ for testnet.

```
<hardhat command here> --network polygon_testnet
```

b) **Polygon main** network  
Make sure you have _enough real MATIC tokens_ in your wallet. Deployment to the mainnet costs money!

```
<hardhat command here> --network polygon_mainnet
```

c) **Hardhat** network

- Run Hardhat node locally. All _deploy scripts_ will be executed as well:

```
npx hardhat node
```

- Run sripts on the node

```
npx hardhat run <script name here> --network localhost
```

<a name="wallets"/>

### Wallets

For deployment of contracts and interactions with contracts you will need to use either _your existing wallet_ or _a generated one_.

#### Using an existing wallet

If you choose to use your existing wallet, then you would need to be able to export (copy/paste) its private key. For example, you can export private key from your MetaMask wallet.  
Wallet's address and private key should be pasted into the `.env` file (see [Prerequisites](#preqs)).

#### Creating a new wallet

If you choose to create a fresh wallet for this project, you should use `createWallet` script from `scripts/` directory.

```
node scripts/createWallet.js
```

This will generate a single new wallet and show its address and private key. **Save** them somewhere else!
A new wallet _does not_ hold any tokens. You have to provide it with tokens of your choice.  
Wallet's address and private key should be pasted into the `.env` file (see [Prerequisites](#preqs)).

<a name="logic"/>

### Smart Contract Logic

---

**For more details see `docs/` directory**

---

**Roles**:

- _Admin_: admin of the project, starts inital sales of tokens
- _User_: buys project tokens, trades them or any other tokens
  - Admins can do all the same operations users can.

<a name="dex"/>

#### BentureDex.sol

**Traded tokens**  
- Native tokens can be sold and bought
- ERC20 tokens can be sold and bought (except native tokens in Sell orders)

---

**Admin side**

*Sale orders*    
After creating the project the admin can sell project tokens to users. Any user buying the project token becomes the member of the project. Admin does this by placing *non-cancellable* limit sell orders (*Sale* orders). This Sale can be interpreted as the ICO of project tokens. Only admins can create Sale orders.  
No native tokens can be sold in Sell orders.  

_Regular orders_  
Apart from creating Sale orders, admins, just like other users, can create "regular" (limit/market sell/buy) orders.

_Fees_  
Admins can withdraw fees paid by users for orders creation. Default fee rate is 0.1% of order amount. Admins can change fee rate.

---

**User side**

_Regular orders_  
Users can only create "regular" (limit/market sell/buy) orders.

_Fees_  
User pays fees each time he creates an order. Default fee rate is 0.1% of order amount.

---

**Limit orders**

- Only admins can create non-cancellabe limit orders (Sale orders). All other limit orders are cancellable by default
- Do not have a `price slippage` parameter

**Market orders**

- Are always non-cancellable
- Have a `price slippage` parameter. Only negative slippage is taken into account

---

**Market price**  
Market price is equal to the limit price of the last executed limit order

---

**Backend signatures**  
Some functions can only be executed if the transaction contains signature of a backend wallet. This guarantees safety of DEX operations.  
Following functions require backend signature:

- `buyMarket`
- `sellMarket`
- `matchOrders`

---

**Order matching**  
Order matching is done off-chain. After that an order matching function is triggered on-chain to execute orders. Only backend wallet is allowed to trigger orders execution.

<a name="output"/>

### Structure of Deploy Output File

This file contains the result of contracts deployment.

It is separated in 2 parts. Each of them represents deployment to testnet or mainnet.  
Each part contains information about all deployed contracts:

- The address of the contract (`address`)
- The URL for Polygonscan page with verified code of the contract (`verification`)

---

<a name="issues"/>

**[Known Issues]**
