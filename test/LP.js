const { expect } = require("chai");
const { ethers, upgrades, waffle } = require('hardhat');
const provider = waffle.provider;

const web3 = require('web3');

const toWei = function (v) {
    return web3.utils.toWei(v, 'ether');
}
const toMwei = function (v) {
    return web3.utils.toWei(v, 'mwei');
}
const fromWei = function (v) {
    return web3.utils.fromWei(v.toString(), 'ether');
}
const fromMwei = function (v) {
    return web3.utils.fromWei(v.toString(), 'mwei');
}

const blockTimestamp = async function() {
    const currentBlock = await ethers.provider.getBlock("latest");
    return currentBlock.timestamp;
}
const increaseTime = async function (duration) {
    await ethers.provider.send("evm_increaseTime", [duration]);
    await ethers.provider.send('evm_mine');
}

async function mineNBlocks(n) {
    for (let index = 0; index < n; index++) {
        await ethers.provider.send('evm_mine');
    }
}

async function logLR() {
    console.log("Asset = ", fromWei(await lpusdc.asset()))
    console.log("Liability = ", fromWei(await lpusdc.liability()))
    console.log(fromWei(await lpusdc.getMaxLR()))
}

async function assertMaxLR(expectedVal) {
    const val = parseFloat(fromWei(await lpusdc.getMaxLR()))
    expect(val).to.be.closeTo(expectedVal, expectedVal / 1000)
}

async function showHistory() {
    for (let i = 0; i < 20; i++) {
        const history = await lpusdc.getSumHistory(i)
        console.log(fromWei(history.runningSum) / history.duration);
    }
}

const ONE_DAY = 86400

const zeroAddress = '0x0000000000000000000000000000000000000000';
const mntPerBlock = "91324200913242000";

let deployer, user, treasury, other;
let pool, usdc, usdt, usdp, lpusdc, lpusdt, lpusdp, mnt, vemnt, mm, currentTime;

describe("LP", async function () {

    beforeEach(async function () {
        [deployerSigner, userSigner, treasurySigner, otherSigner] = await ethers.getSigners();
        deployer = deployerSigner.address
        user = userSigner.address
        treasury = treasurySigner.address
        other = otherSigner.address

        const MockToken = await ethers.getContractFactory("StableFake");
        usdc = await MockToken.deploy("usdc", "usdc", toMwei('1000000'), 6);
        await usdc.deployed();
        usdt = await MockToken.deploy("usdt", "usdt", toMwei('1000000'), 6);
        await usdt.deployed();

        const MockRebaseToken = await ethers.getContractFactory("StableRebaseFake");
        usdp = await MockRebaseToken.deploy("usdp", "usdp", toMwei('1000000'), 6);
        await usdp.deployed();

        const LP = await ethers.getContractFactory("LP");
        lpusdc = await upgrades.deployProxy(LP, ["lpusdc", "lpusdc", usdc.address, deployer, deployer], { initializer: 'initialize'});
        await lpusdc.deployed();
        lpusdt = await upgrades.deployProxy(LP, ["lpusdt", "lpusdt", usdt.address, deployer, deployer], { initializer: 'initialize'});
        await lpusdt.deployed();

        currentTime = await blockTimestamp();

    });

    it("Test Max LR", async function () {
        await assertMaxLR(1)
        await lpusdc.updateAssetLiability(toWei('100000'), true, toWei('120000'), true)
        await assertMaxLR(1)
        await increaseTime(3600)
        await assertMaxLR(1)
        await lpusdc.updateAssetLiability(toWei('60000'), true, 0, true)
        await assertMaxLR(4/3)
        await increaseTime(3600)
        await assertMaxLR(4/3)
        await increaseTime(ONE_DAY)
        await lpusdc.updateAssetLiability(0, true, toWei('60000'), true)
        await assertMaxLR(4/3)
        await increaseTime(ONE_DAY)
        await assertMaxLR(1.12)
        await increaseTime(ONE_DAY*3)
        await assertMaxLR(1)
        await lpusdc.updateAssetLiability(0, true, toWei('60000'), false)
        await assertMaxLR(4/3)
    });

    it("Simulate Max LR", async function () {
        await logLR()
        await lpusdc.updateAssetLiability(toWei('100000'), true, toWei('120000'), true)
        await logLR()
        console.log("1 hr")
        await increaseTime(3600)
        await lpusdc.updateAssetLiability(toWei('60000'), true, 0, true)
        await logLR()
        console.log("1 hr")
        await increaseTime(3600)
        await lpusdc.updateAssetLiability(toWei('10000'), false, 0, true)
        await logLR()
        console.log("1 hr")
        await increaseTime(3600)
        await lpusdc.updateAssetLiability(toWei('10000'), false, 0, true)
        await logLR()
        console.log("1 day")
        await increaseTime(ONE_DAY)
        await lpusdc.updateAssetLiability(toWei('10000'), true, toWei('10000'), true)
        await logLR()
        console.log("1 day")
        await increaseTime(ONE_DAY)
        await lpusdc.updateAssetLiability(toWei('10000'), true, toWei('10000'), true)
        await logLR()
        console.log("1 hr")
        await increaseTime(3600)
        await lpusdc.updateAssetLiability(toWei('100000'), true, 0, true)
        await logLR()
        console.log("1 hr")
        await increaseTime(3600)
        await lpusdc.updateAssetLiability(toWei('50000'), false, 0, true)
        await logLR()
        console.log("1 hr")
        await increaseTime(3600)
        await lpusdc.updateAssetLiability(toWei('10000'), false, 0, true)
        await logLR()
        console.log("1 hr")
        await increaseTime(3600)
        await lpusdc.updateAssetLiability(toWei('10000'), false, 0, true)
        await logLR()
        console.log("1 day")
        await increaseTime(ONE_DAY)
        await lpusdc.updateAssetLiability(0, false, 0, true)
        await logLR()
        console.log("1 day")
        await increaseTime(ONE_DAY)
        await lpusdc.updateAssetLiability(0, false, 0, true)
        await logLR()
        console.log("1 day")
        await increaseTime(ONE_DAY)
        await lpusdc.updateAssetLiability(0, false, 0, true)
        await logLR()
        console.log("1 day")
        await increaseTime(ONE_DAY)
        await lpusdc.updateAssetLiability(0, false, 0, true)
        await logLR()
        console.log("1 day")
        await increaseTime(ONE_DAY)
        await lpusdc.updateAssetLiability(0, false, 0, true)
        await logLR()
        console.log("1 day")
        await increaseTime(ONE_DAY)
        await lpusdc.updateAssetLiability(0, false, 0, true)
        await logLR()
        console.log("1 day")
        await increaseTime(ONE_DAY)
        await lpusdc.updateAssetLiability(0, false, 0, true)
        await logLR()
        console.log("1 day")
        await increaseTime(ONE_DAY)
        await lpusdc.updateAssetLiability(0, false, 0, true)
        await logLR()
        console.log("1 day")
        await increaseTime(ONE_DAY)
        await lpusdc.updateAssetLiability(0, false, 0, true)
        await logLR()
        console.log("1 day")
        await increaseTime(ONE_DAY)
        await lpusdc.updateAssetLiability(0, false, 0, true)
        await logLR()
        console.log("1 day")
        await increaseTime(ONE_DAY)
        await lpusdc.updateAssetLiability(0, false, 0, true)
        await logLR()
        console.log("1 day")
        await increaseTime(ONE_DAY)
        await lpusdc.updateAssetLiability(0, false, 0, true)
        await logLR()
        console.log("1 day")
        await increaseTime(ONE_DAY)
        await lpusdc.updateAssetLiability(0, false, 0, true)
        await logLR()
        console.log("1 day")
        await increaseTime(ONE_DAY)
        await lpusdc.updateAssetLiability(toWei('40000'), true, 0, true)
        await logLR()
        await showHistory()
    });
});
