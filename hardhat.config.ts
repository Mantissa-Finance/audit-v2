import { config as dotEnvConfig } from 'dotenv'
import { HardhatUserConfig, task } from "hardhat/config"
import "hardhat-deploy"
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import 'hardhat-contract-sizer'
import "@typechain/hardhat"
import "hardhat-gas-reporter"
import "@nomiclabs/hardhat-etherscan";
import "@openzeppelin/hardhat-upgrades";

dotEnvConfig()

const MATIC_ENDPOINT = process.env.MATIC_ENDPOINT || ''
const MUMBAI_ENDPOINT = process.env.MUMBAI_ENDPOINT || ''
const ZKEVM_TESTNET_ENDPOINT = process.env.ZKEVM_TESTNET_ENDPOINT || ''
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY || ''
const TEST_PRIVATE_KEY = process.env.TEST_PRIVATE_KEY || ''
const MAIN_PRIVATE_KEY = process.env.MAIN_PRIVATE_KEY || ''

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  solidity: {
    compilers: [{
      version: '0.8.9',
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      },
    }]
  },
  namedAccounts: {
    deployer: 0
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: false,
      tags: ["local"]
    },
    localhost: {
      live: false,
      saveDeployments: true,
      allowUnlimitedContractSize: false,
      tags: ["local"]
    },
    matic_test: {
      url: MUMBAI_ENDPOINT,
      accounts: [TEST_PRIVATE_KEY],
      live: false,
      saveDeployments: true,
      tags: ["testnet"]
    },
    zkevm_test: {
      url: ZKEVM_TESTNET_ENDPOINT,
      accounts: [TEST_PRIVATE_KEY],
      live: false,
      saveDeployments: true,
      tags: ["testnet2"]
    },
    matic: {
      url: MATIC_ENDPOINT,
      accounts: [MAIN_PRIVATE_KEY],
      live: false,
      saveDeployments: true,
      tags: ["mainnet"]
    }
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
  },
  etherscan: {
    apiKey: POLYGONSCAN_API_KEY,
  },
  typechain: {
    outDir: process.env.TYPECHAIN_DIR || 'types/ethers',
    target: process.env.TYPECHAIN_TARGET || 'ethers-v5'
  },
  mocha: {
    timeout: 100000
  }
};

export default config