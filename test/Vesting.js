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
}

const zeroAddress = '0x0000000000000000000000000000000000000000';
const ONE_DAY = 86400

let deployer, user, other;
let mnt, vesting1, vesting2;

describe("Vesting", async function () {

    beforeEach(async function () {
        [deployerSigner, userSigner, otherSigner] = await ethers.getSigners();
        deployer = deployerSigner.address
        user = userSigner.address
        other = otherSigner.address
        const MNT = await ethers.getContractFactory("MNT");
        mnt = await MNT.deploy(deployer);
        await mnt.deployed();

        const currentTime = await blockTimestamp();
        const Vesting = await ethers.getContractFactory("Vesting");
        vesting1 = await Vesting.deploy(mnt.address, user, currentTime, 180 * ONE_DAY, 730 * ONE_DAY, toWei('1000000'), false);
        await vesting1.deployed();

        vesting2 = await Vesting.deploy(mnt.address, other, currentTime, 180 * ONE_DAY, 730 * ONE_DAY, toWei('1000000'), true);
        await vesting2.deployed();

        await mnt.transfer(vesting1.address, toWei('1000000'))
        await mnt.transfer(vesting2.address, toWei('1001000'))
    });

    it("Test recipient & cliff", async function () {
        await expect(vesting1.claim()).to.be.revertedWith('Not Allowed');
        expect(await vesting1.getAmountClaimable()).to.be.eq(0);
    });

    it("Test revoke", async function () {
        await expect(vesting1.revoke()).to.be.revertedWith('Cannot be revoked');
        await expect(vesting1.withdraw(mnt.address)).to.be.revertedWith('Nothing to withdraw')
        const oldBalance = parseInt(fromWei(await mnt.balanceOf(deployer)))
        await vesting2.withdraw(mnt.address);
        const newBalance = parseInt(fromWei(await mnt.balanceOf(deployer)))
        expect(newBalance - oldBalance).to.be.eq(1000)
        await vesting2.revoke();
        await vesting2.withdraw(mnt.address);
        const finalBalance = parseInt(fromWei(await mnt.balanceOf(deployer)))
        expect(finalBalance - oldBalance).to.be.eq(1001000);
    });

    it("Test claim", async function () {
        await expect(vesting1.connect(userSigner).claim()).to.be.revertedWith('Nothing to claim');
        await increaseTime(280 * ONE_DAY);
        await vesting1.connect(userSigner).claim();
        const newBalance = parseInt(fromWei(await mnt.balanceOf(user)));
        const expectedAmount = parseInt(100 * 1000000 / 730);
        expect(newBalance).to.be.closeTo(expectedAmount, 5)
        const remaining = parseInt(fromWei(await vesting1.amountRemaining()))
        expect(remaining).to.be.closeTo(1000000 - expectedAmount, 1)

        await increaseTime(1000 * ONE_DAY);
        await vesting1.connect(userSigner).claim();
        expect(parseInt(fromWei(await mnt.balanceOf(user)))).to.be.eq(1000000)
        expect(parseInt(fromWei(await mnt.balanceOf(vesting1.address)))).to.be.eq(0)
    });

    it("Test new recipient", async function () {
        await expect(vesting1.connect(userSigner).claim()).to.be.revertedWith('Nothing to claim');
        await increaseTime(280 * ONE_DAY);
        await vesting1.connect(userSigner).transferRecipient(other)
        await expect(vesting1.connect(userSigner).claim()).to.be.revertedWith('Not Allowed');
        await vesting1.connect(otherSigner).claim();
    });
});
