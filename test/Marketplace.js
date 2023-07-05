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

async function mineNBlocks(n) {
    for (let index = 0; index < n; index++) {
        await ethers.provider.send('evm_mine');
    }
}

const ONE_DAY = 86400

const zeroAddress = '0x0000000000000000000000000000000000000000';
const mntPerBlock = "91324200913242000";

let deployer, user, treasury, other;
let pool, usdc, usdt, lpusdc, lpusdt, mnt, vemnt, mm, currentTime;

describe("Marketplace", async function () {

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
        dai = await MockToken.deploy("dai", "dai", toWei('1000000'), 18);
        await dai.deployed();

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

        const MNT = await ethers.getContractFactory("MNTS");
        mnt = await MNT.deploy(zeroAddress, treasury, toWei('500000000'));
        await mnt.deployed();

        const veMNT = await ethers.getContractFactory("veMNT");
        vemnt = await upgrades.deployProxy(veMNT, [mnt.address], { initializer: 'initialize' });
        await vemnt.deployed();

        const Marketplace = await ethers.getContractFactory("Marketplace");
        marketplace = await upgrades.deployProxy(Marketplace, [mnt.address, vemnt.address, treasury], { initializer: 'initialize' });
        await marketplace.deployed();

        currentTime = await blockTimestamp();

        const MasterMantis = await ethers.getContractFactory("MasterMantis");
        mm = await upgrades.deployProxy(MasterMantis, [mnt.address, vemnt.address, mntPerBlock, currentTime+10000000], { initializer: 'initialize' });
        await mm.deployed();

        const LP = await ethers.getContractFactory("LP");
        lpusdc = await upgrades.deployProxy(LP, ["lpusdc", "lpusdc", usdc.address, pool.address, mm.address], { initializer: 'initialize'});
        await lpusdc.deployed();
        lpusdt = await upgrades.deployProxy(LP, ["lpusdt", "lpusdt", usdt.address, pool.address, mm.address], { initializer: 'initialize'});
        await lpusdt.deployed();

        await pool.setTreasury(deployer);
        await pool.setMasterMantis(mm.address);
        await pool.addLP(usdc.address, lpusdc.address, usdcFeed.address);
        await pool.addLP(usdt.address, lpusdt.address, usdtFeed.address);

        await mm.add(10000, lpusdc.address);
        await mm.add(10000, lpusdt.address);
        await mm.setPoolContract(pool.address, true);

        await usdc.approve(pool.address, toMwei('10000000000'));
        await usdt.approve(pool.address, toMwei('10000000000'));
        await lpusdc.approve(mm.address, toMwei('10000000000'));
        await lpusdt.approve(mm.address, toMwei('10000000000'));
        await usdc.transfer(user, toMwei('100000'))
        await dai.transfer(user, toWei('100000'))

        await pool.deposit(usdc.address, deployer, toMwei('100000'), false, 2652351324);
        await pool.deposit(usdt.address, deployer, toMwei('90000'), false, 2652351324);

        await mm.deposit(deployer, 0, toMwei('100000'));
        await mnt.connect(treasurySigner).transfer(mm.address, toWei('100000'));
        await mnt.connect(treasurySigner).transfer(deployer, toWei('100000'));
        await mnt.connect(treasurySigner).transfer(user, toWei('100000'));

        await vemnt.addMasterMantis(mm.address);
        await mnt.approve(vemnt.address, toWei('100000000'));
        await vemnt.setMarketplace(marketplace.address)
        await marketplace.setAllowedToken(usdc.address, true);
        await marketplace.setAllowedToken(usdt.address, true);
        await marketplace.setAllowedToken(dai.address, true);

        await usdc.connect(userSigner).approve(marketplace.address, toWei('100000000'))
        await dai.connect(userSigner).approve(marketplace.address, toWei('100000000'))

        await vemnt.deposit(deployer, toWei('60000'))
        await increaseTime(60*ONE_DAY)
        await vemnt.claim()

        currentTime = await blockTimestamp();

    });

    it("Test Listing", async function () {
        const oldUserData = await vemnt.userData(deployer)
        const oldUserMnt = parseInt(fromWei(oldUserData.amount))
        const oldUserVemnt = parseInt(fromWei(await vemnt.balanceOf(deployer)))
        
        await expect(marketplace.addListing(1000, toMwei('100'), currentTime+100, true))
        .to.be.revertedWith('Incorrect end duration')
        await expect(marketplace.addListing(1000, toMwei('100'), currentTime+100000, true))
        .to.be.revertedWith('Incorrect end duration')
        const listingAdd = await marketplace.addListing(1000, toMwei('100'), currentTime+100, false)
        // const result = await listingAdd.wait()
        // console.log(result.events[3].args)

        const newUserData = await vemnt.userData(deployer)
        const newUserMnt = parseInt(fromWei(newUserData.amount))
        const newUserVemnt = parseInt(fromWei(await vemnt.balanceOf(deployer)))
        
        const mntTransfer = parseInt(oldUserMnt / 10);
        const veMntTransfer = parseInt(oldUserVemnt / 10);
        expect(oldUserMnt - newUserMnt).to.be.eq(mntTransfer)
        expect(oldUserVemnt - newUserVemnt).to.be.eq(veMntTransfer)
        expect(oldUserData.veMntRate).to.be.eq(newUserData.veMntRate)

        const listing = await marketplace.listings(deployer, 1)
        expect(listing.veMntRate).to.be.eq(oldUserData.veMntRate)
        expect(parseInt(fromWei(listing.mntLpAmount))).to.be.eq(mntTransfer)
        expect(parseInt(fromWei(listing.veMntAmount))).to.be.eq(veMntTransfer)

        expect(parseInt(fromWei(await mnt.balanceOf(marketplace.address)))).to.be.eq(mntTransfer)
        expect(parseInt(fromWei(await vemnt.balanceOf(marketplace.address)))).to.be.eq(veMntTransfer)
    });

    it("Test Delete Listing", async function () {
        const oldUserData = await vemnt.userData(deployer)
        const oldUserMnt = parseInt(fromWei(oldUserData.amount))
        const oldUserVemnt = parseInt(fromWei(await vemnt.balanceOf(deployer)))
        
        await marketplace.addListing(1000, toMwei('100'), currentTime+100, false)
        await marketplace.deleteListing(1)

        const newUserData = await vemnt.userData(deployer)
        const newUserMnt = parseInt(fromWei(newUserData.amount))
        const newUserVemnt = parseInt(fromWei(await vemnt.balanceOf(deployer)))
        
        expect(oldUserMnt - newUserMnt).to.be.eq(0)
        expect(oldUserVemnt - newUserVemnt).to.be.eq(0)
        expect(oldUserData.veMntRate).to.be.eq(newUserData.veMntRate)

        const listing = await marketplace.listings(deployer, 1)
        expect(listing.veMntRate).to.be.eq(0)
        expect(parseInt(fromWei(listing.mntLpAmount))).to.be.eq(0)
        expect(parseInt(fromWei(listing.veMntAmount))).to.be.eq(0)

        expect(parseInt(fromWei(await mnt.balanceOf(marketplace.address)))).to.be.eq(0)
        expect(parseInt(fromWei(await vemnt.balanceOf(marketplace.address)))).to.be.eq(0)
    });

    it("Test Buy", async function () {
        const oldUserData = await vemnt.userData(deployer)
        const oldUserMnt = parseInt(fromWei(oldUserData.amount))
        const oldUserVemnt = parseInt(fromWei(await vemnt.balanceOf(deployer)))
        const oldUserUsdc = parseInt(fromMwei(await usdc.balanceOf(deployer)));
        const oldOtherUsdc = parseInt(fromMwei(await usdc.balanceOf(user)));
        await marketplace.addListing(1000, toMwei('100'), currentTime+100, false)
        await expect(marketplace.connect(userSigner).buy(deployer, 1, usdc.address)).to.be.revertedWith('Not Started')
        await increaseTime(1801);
        console.log(await vemnt.userData(user))
        await marketplace.connect(userSigner).buy(deployer, 1, usdc.address)

        const newUserUsdc = parseInt(fromMwei(await usdc.balanceOf(deployer)));
        const newOtherUsdc = parseInt(fromMwei(await usdc.balanceOf(user)));

        const newUserData = await vemnt.userData(deployer)
        const newUserMnt = parseInt(fromWei(newUserData.amount))
        const newUserVemnt = parseInt(fromWei(await vemnt.balanceOf(deployer)))

        const mntTransfer = parseInt(oldUserMnt / 10);
        const veMntTransfer = parseInt(oldUserVemnt / 10);
        expect(oldUserMnt - newUserMnt).to.be.eq(mntTransfer)
        expect(oldUserVemnt - newUserVemnt).to.be.eq(veMntTransfer)
        expect(oldUserData.veMntRate).to.be.eq(newUserData.veMntRate)

        const otherUserData = await vemnt.userData(user);
        const otherUserMnt = parseInt(fromWei(otherUserData.amount))
        const otherUserVemnt = parseInt(fromWei(await vemnt.balanceOf(user)))

        expect(otherUserData.veMntRate).to.be.eq(oldUserData.veMntRate)
        expect(otherUserMnt).to.be.eq(mntTransfer)
        expect(otherUserVemnt).to.be.eq(veMntTransfer)
        
        expect(oldOtherUsdc - newOtherUsdc).to.be.eq(100)
        expect(newUserUsdc - oldUserUsdc).to.be.eq(98)
        expect(parseInt(fromMwei(await usdc.balanceOf(treasury)))).to.be.eq(2)

        const listing = await marketplace.listings(deployer, 1)
        expect(listing.sold).to.be.eq(true)
        await expect(marketplace.deleteListing(1)).to.be.revertedWith("No such listing")

        expect(parseInt(fromWei(await mnt.balanceOf(marketplace.address)))).to.be.eq(0)
        expect(parseInt(fromWei(await vemnt.balanceOf(marketplace.address)))).to.be.eq(0)
    });

    it("Test Buy decimals", async function () {
        const oldUserData = await vemnt.userData(deployer)
        const oldUserMnt = parseInt(fromWei(oldUserData.amount))
        const oldUserVemnt = parseInt(fromWei(await vemnt.balanceOf(deployer)))
        const oldUserDai = parseInt(fromWei(await dai.balanceOf(deployer)));
        const oldOtherDai = parseInt(fromWei(await dai.balanceOf(user)));
        await marketplace.addListing(1000, toMwei('100'), currentTime+100, false)
        await expect(marketplace.connect(userSigner).buy(deployer, 1, dai.address)).to.be.revertedWith('Not Started')
        await increaseTime(1801);
        await marketplace.connect(userSigner).buy(deployer, 1, dai.address)

        const newUserDai = parseInt(fromWei(await dai.balanceOf(deployer)));
        const newOtherDai = parseInt(fromWei(await dai.balanceOf(user)));

        const newUserData = await vemnt.userData(deployer)
        const newUserMnt = parseInt(fromWei(newUserData.amount))
        const newUserVemnt = parseInt(fromWei(await vemnt.balanceOf(deployer)))

        const mntTransfer = parseInt(oldUserMnt / 10);
        const veMntTransfer = parseInt(oldUserVemnt / 10);
        expect(oldUserMnt - newUserMnt).to.be.eq(mntTransfer)
        expect(oldUserVemnt - newUserVemnt).to.be.eq(veMntTransfer)
        expect(oldUserData.veMntRate).to.be.eq(newUserData.veMntRate)

        const otherUserData = await vemnt.userData(user);
        const otherUserMnt = parseInt(fromWei(otherUserData.amount))
        const otherUserVemnt = parseInt(fromWei(await vemnt.balanceOf(user)))

        expect(otherUserData.veMntRate).to.be.eq(oldUserData.veMntRate)
        expect(otherUserMnt).to.be.eq(mntTransfer)
        expect(otherUserVemnt).to.be.eq(veMntTransfer)
        
        expect(oldOtherDai - newOtherDai).to.be.eq(100)
        expect(newUserDai - oldUserDai).to.be.eq(98)
        expect(parseInt(fromWei(await dai.balanceOf(treasury)))).to.be.eq(2)

        const listing = await marketplace.listings(deployer, 1)
        expect(listing.sold).to.be.eq(true)
        await expect(marketplace.deleteListing(1)).to.be.revertedWith("No such listing")

        expect(parseInt(fromWei(await mnt.balanceOf(marketplace.address)))).to.be.eq(0)
        expect(parseInt(fromWei(await vemnt.balanceOf(marketplace.address)))).to.be.eq(0)
    });

    it("Test Auction", async function () {
        await usdc.transfer(other, toMwei('10000'))
        await usdc.connect(otherSigner).approve(marketplace.address, toWei('100000000'))

        const oldUserData = await vemnt.userData(deployer)
        const oldUserMnt = parseInt(fromWei(oldUserData.amount))
        const oldUserVemnt = parseInt(fromWei(await vemnt.balanceOf(deployer)))
        const oldUserUsdc = parseInt(fromMwei(await usdc.balanceOf(deployer)));
        const oldUserDai = parseInt(fromWei(await dai.balanceOf(deployer)));
        const oldOtherUsdc = parseInt(fromMwei(await usdc.balanceOf(other)));
        const oldWinnerDai = parseInt(fromWei(await dai.balanceOf(user)));
        await marketplace.addListing(1000, toMwei('100'), 10000, true)
        await expect(marketplace.connect(otherSigner).makeAuctionBid(deployer, 1, usdc.address, toMwei('80')))
        .to.be.revertedWith('Not Started');

        await increaseTime(3600);
        await expect(marketplace.connect(otherSigner).makeAuctionBid(deployer, 1, usdc.address, toMwei('80')))
        .to.be.revertedWith('Amount too low');
        await marketplace.connect(otherSigner).makeAuctionBid(deployer, 1, usdc.address, toMwei('110'))

        const midOtherUsdc = parseInt(fromMwei(await usdc.balanceOf(other)))
        const midMarketUsdc = parseInt(fromMwei(await usdc.balanceOf(marketplace.address)))
        expect(oldOtherUsdc - midOtherUsdc).to.be.eq(110)
        expect(midMarketUsdc).to.be.eq(110)

        await expect(marketplace.connect(userSigner).makeAuctionBid(deployer, 1, dai.address, toMwei('105')))
        .to.be.revertedWith('Amount too low')
        await marketplace.connect(userSigner).makeAuctionBid(deployer, 1, dai.address, toMwei('200'))

        const newOtherUsdc = parseInt(fromMwei(await usdc.balanceOf(other)))
        const newMarketUsdc = parseInt(fromMwei(await usdc.balanceOf(marketplace.address)))
        const newMarketDai = parseInt(fromWei(await dai.balanceOf(marketplace.address)))
        expect(newOtherUsdc).to.be.eq(oldOtherUsdc)
        expect(newMarketUsdc).to.be.eq(0)
        expect(newMarketDai).to.be.eq(200)

        await expect(marketplace.claimAuctionBid(deployer, 1)).to.be.revertedWith('Auction not over');
        await increaseTime(11000)
        await marketplace.claimAuctionBid(deployer, 1)
        await expect(marketplace.claimAuctionBid(deployer, 1)).to.be.revertedWith('Already claimed');

        const newUserUsdc = parseInt(fromMwei(await usdc.balanceOf(deployer)));
        const newUserDai = parseInt(fromWei(await dai.balanceOf(deployer)));

        const newUserData = await vemnt.userData(deployer)
        const newUserMnt = parseInt(fromWei(newUserData.amount))
        const newUserVemnt = parseInt(fromWei(await vemnt.balanceOf(deployer)))

        const mntTransfer = parseInt(oldUserMnt / 10);
        const veMntTransfer = parseInt(oldUserVemnt / 10);
        expect(oldUserMnt - newUserMnt).to.be.eq(mntTransfer)
        expect(oldUserVemnt - newUserVemnt).to.be.eq(veMntTransfer)
        expect(oldUserData.veMntRate).to.be.eq(newUserData.veMntRate)

        const otherUserData = await vemnt.userData(user);
        const otherUserMnt = parseInt(fromWei(otherUserData.amount))
        const otherUserVemnt = parseInt(fromWei(await vemnt.balanceOf(user)))

        expect(otherUserData.veMntRate).to.be.eq(oldUserData.veMntRate)
        expect(otherUserMnt).to.be.eq(mntTransfer)
        expect(otherUserVemnt).to.be.eq(veMntTransfer)
        
        expect(newUserUsdc - oldUserUsdc).to.be.eq(0)
        expect(newUserDai - oldUserDai).to.be.eq(196)
        expect(parseInt(fromWei(await dai.balanceOf(treasury)))).to.be.eq(4)

        const listing = await marketplace.listings(deployer, 1)
        expect(listing.sold).to.be.eq(true)
        await expect(marketplace.deleteListing(1)).to.be.revertedWith("No such listing")

        expect(parseInt(fromWei(await mnt.balanceOf(marketplace.address)))).to.be.eq(0)
        expect(parseInt(fromWei(await vemnt.balanceOf(marketplace.address)))).to.be.eq(0)
    });
});
