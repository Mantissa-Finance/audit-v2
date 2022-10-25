# Mantis Swap Contracts
- All contracts are upgradeable except MNT, PoolHelper and Vesting contracts
- Owner of all contracts will be a multisig
- `Pool`, `MasterMantis`, `veMNT` and `Marketplace` contracts will directly interact with the user. Other contracts are complementary.

## Setup
```shell
npm install
```

Add a `.env` file with atleast the following parameters -
```
TEST_PRIVATE_KEY="xxx"
MAIN_PRIVATE_KEY="xxx"
```
OR update the `hardhat.config.ts` file accordingly.

Use the following commands:
```shell
npx hardhat compile
npx hardhat test
```
