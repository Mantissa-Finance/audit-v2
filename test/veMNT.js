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

const zeroAddress = '0x0000000000000000000000000000000000000000';
const mntPerBlock = "91324200913242000";

let deployer, user, treasury, other;
let pool, usdc, usdt, lpusdc, lpusdt, mnt, vemnt, mm;

describe("veMNT", async function () {

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

        const PoolHelper = await ethers.getContractFactory("PoolHelper");
        poolHelper = await PoolHelper.deploy();
        await poolHelper.deployed();

        const MockAggregator = await ethers.getContractFactory("MockAggregator");
        usdcFeed = await MockAggregator.deploy("100000000");
        await usdcFeed.deployed();
        usdtFeed = await MockAggregator.deploy("100001000");
        await usdtFeed.deployed();

        const Pool = await ethers.getContractFactory("Pool");
        pool = await upgrades.deployProxy(Pool, [zeroAddress, treasury, poolHelper.address], { initializer: 'initialize' });
        await pool.deployed();

        const MNT = await ethers.getContractFactory("MNT");
        mnt = await MNT.deploy(treasury);
        await mnt.deployed();

        const veMNT = await ethers.getContractFactory("veMNT");
        vemnt = await upgrades.deployProxy(veMNT, [mnt.address], { initializer: 'initialize' });
        await vemnt.deployed();

        const MasterMantis = await ethers.getContractFactory("MasterMantis");
        mm = await upgrades.deployProxy(MasterMantis, [mnt.address, vemnt.address, mntPerBlock, (await blockTimestamp())+10000000], { initializer: 'initialize' });
        await mm.deployed();

        const LP = await ethers.getContractFactory("LP");
        lpusdc = await upgrades.deployProxy(LP, ["lpusdc", "lpusdc", usdc.address, pool.address, mm.address], { initializer: 'initialize'});
        await lpusdc.deployed();
        lpusdt = await upgrades.deployProxy(LP, ["lpusdt", "lpusdt", usdt.address, pool.address, mm.address], { initializer: 'initialize'});
        await lpusdt.deployed();

        const MockPiston = await ethers.getContractFactory("MockPiston");
        piston = await MockPiston.deploy(mnt.address, vemnt.address);
        await piston.deployed();

        await pool.setTreasury(deployer);
        await pool.addLP(usdc.address, lpusdc.address, usdcFeed.address);
        await pool.addLP(usdt.address, lpusdt.address, usdtFeed.address);

        await vemnt.addMasterMantis(mm.address);

        await mm.add(25, lpusdc.address);
        await mm.add(25, lpusdt.address);

        await usdc.approve(pool.address, toMwei('10000000000'));
        await usdt.approve(pool.address, toMwei('10000000000'));
        await lpusdc.approve(mm.address, toMwei('10000000000'));
        await lpusdt.approve(mm.address, toMwei('10000000000'));
        await mnt.approve(vemnt.address, toWei('100000000'));

        await pool.deposit(usdc.address, deployer, toMwei('100000'), false, 2652351324);
        await pool.deposit(usdt.address, deployer, toMwei('90000'), false, 2652351324);

        await mm.deposit(deployer, 0, toMwei('100000'));
        await mnt.connect(treasurySigner).transfer(mm.address, toWei('100000'));
        await mnt.connect(treasurySigner).transfer(deployer, toWei('100000'));
        await mnt.connect(treasurySigner).transfer(piston.address, toWei('10000'));
    });

    it("Test caller", async function () {
        await expect(piston.stake(toWei('100'))).to.be.revertedWith('Caller not allowed');
        await vemnt.setWhitelist(piston.address, true);
        await piston.stake(toWei('100'));
    });

    it("Test vemnt deposit", async function () {
        await vemnt.deposit(deployer, toWei('10000'))
        await increaseTime(86400)
        await vemnt.claim()
        const veMntPerSec = parseFloat(fromWei(await vemnt.veMntPerSec()))
        let expectedVemnt = veMntPerSec * 86400 * 10000
        let vemntUser = parseFloat(fromWei(await vemnt.balanceOf(deployer)))
        expect(vemntUser).to.be.closeTo(expectedVemnt, expectedVemnt / 1000)
        let userData = await vemnt.userData(deployer)
        let expectedRate = parseFloat(fromWei(userData.veMntRate))
        await increaseTime(86400*365)
        await vemnt.deposit(deployer, toWei('10000'))
        await vemnt.claim()
        expectedVemnt += expectedRate * 365 * 86400 * 10000
        vemntUser = parseFloat(fromWei(await vemnt.balanceOf(deployer)))
        expect(vemntUser).to.be.closeTo(expectedVemnt, expectedVemnt / 1000)
        userData = await vemnt.userData(deployer)
        expectedRate = parseFloat(fromWei(userData.veMntRate))
        await increaseTime(86400*400)
        await vemnt.deposit(deployer, toWei('10000'))
        await vemnt.claim()
        expectedVemnt += expectedRate * 400 * 86400 * 20000
        vemntUser = parseFloat(fromWei(await vemnt.balanceOf(deployer)))
        expect(vemntUser).to.be.closeTo(expectedVemnt, expectedVemnt / 1000)
    });

    it("Test vemnt deposit other", async function () {
        await vemnt.deposit(user, toWei('10000'))
        await increaseTime(86400)
        await vemnt.claim()
        const veMntPerSec = parseFloat(fromWei(await vemnt.veMntPerSec()))
        let expectedVemnt = 0
        let vemntUser = parseFloat(fromWei(await vemnt.balanceOf(deployer)))
        expect(vemntUser).to.be.closeTo(expectedVemnt, expectedVemnt / 1000)

        await vemnt.connect(userSigner).claim()
        expectedVemnt = veMntPerSec * 86400 * 10000
        vemntUser = parseFloat(fromWei(await vemnt.balanceOf(user)))
        expect(vemntUser).to.be.closeTo(expectedVemnt, expectedVemnt / 1000)
        let userData = await vemnt.userData(user)
        let expectedRate = parseFloat(fromWei(userData.veMntRate))
        await increaseTime(86400*365)
        await vemnt.deposit(user, toWei('10000'))
        await vemnt.claim()
        expectedVemnt = 0
        vemntUser = parseFloat(fromWei(await vemnt.balanceOf(deployer)))
        expect(vemntUser).to.be.closeTo(expectedVemnt, expectedVemnt / 1000)

        await vemnt.connect(userSigner).claim()
        expectedVemnt += expectedRate * 365 * 86400 * 10000
        vemntUser = parseFloat(fromWei(await vemnt.balanceOf(user)))
        expect(vemntUser).to.be.closeTo(expectedVemnt, expectedVemnt / 100)
        userData = await vemnt.userData(user)
        expectedRate = parseFloat(fromWei(userData.veMntRate))
        await increaseTime(86400*400)

        await mnt.transfer(user, toWei('10000'))
        await mnt.connect(userSigner).approve(vemnt.address, toWei('100000'))
        await vemnt.connect(userSigner).deposit(user, toWei('10000'))
        await vemnt.connect(userSigner).claim()
        expectedVemnt += expectedRate * 400 * 86400 * 20000
        vemntUser = parseFloat(fromWei(await vemnt.balanceOf(user)))
        expect(vemntUser).to.be.closeTo(expectedVemnt, expectedVemnt / 100)
    });

    it("Test vemnt rate", async function () {
        await vemnt.deposit(deployer, toWei('10000'))
        await increaseTime(86400)
        await vemnt.claim()
        const veMntPerSec = parseFloat(fromWei(await vemnt.veMntPerSec()))
        let expectedVemnt = veMntPerSec * 86400 * 10000
        let expectedRate = veMntPerSec * (1 - 1 / 730)
        let vemntUser = parseFloat(fromWei(await vemnt.balanceOf(deployer)))
        expect(vemntUser).to.be.closeTo(expectedVemnt, expectedVemnt / 1000)
        let userData = await vemnt.userData(deployer)
        expect(parseFloat(fromWei(userData.veMntRate))).to.be.closeTo(expectedRate, expectedRate / 1000)
        await increaseTime(86400*365)
        await vemnt.claim()
        expectedVemnt += expectedRate * 365 * 86400 * 10000
        expectedRate = expectedRate - veMntPerSec * (1/2)
        vemntUser = parseFloat(fromWei(await vemnt.balanceOf(deployer)))
        expect(vemntUser).to.be.closeTo(expectedVemnt, expectedVemnt / 1000)
        userData = await vemnt.userData(deployer)
        expect(parseFloat(fromWei(userData.veMntRate))).to.be.closeTo(expectedRate, expectedRate / 1000)
        await increaseTime(86400*400)
        await vemnt.claim()
        expectedVemnt += expectedRate * 400 * 86400 * 10000
        vemntUser = parseFloat(fromWei(await vemnt.balanceOf(deployer)))
        expect(vemntUser).to.be.closeTo(expectedVemnt, expectedVemnt / 1000)
        userData = await vemnt.userData(deployer)
        expect(userData.veMntRate).to.be.eq('0')
        await vemnt.deposit(deployer, toWei('10000'))
        expectedRate = veMntPerSec / 2
        userData = await vemnt.userData(deployer)
        expect(parseFloat(fromWei(userData.veMntRate))).to.be.closeTo(expectedRate, expectedRate / 1000)
    });
});
