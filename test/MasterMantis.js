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

async function poolLog() {
    const poolLength = await mm.poolLength()
    console.log("---------------------")
    for (let index = 0; index < poolLength; index++) {
        console.log(await mm.poolInfo(index));
    }
    console.log("---------------------")
}

const zeroAddress = '0x0000000000000000000000000000000000000000';
const mntPerBlock = "91324200913242000";

let deployer, user, treasury, other;
let pool, usdc, usdt, lpusdc, lpusdt, mnt, vemnt, mm, currentTime;

describe("MasterMantis", async function () {

    beforeEach(async function () {
        [deployerSigner, userSigner, treasurySigner, otherSigner] = await ethers.getSigners();
        deployer = deployerSigner.address
        user = userSigner.address
        treasury = treasurySigner.address
        other = otherSigner.address

        const MockToken = await ethers.getContractFactory("StableFake");
        usdc = await MockToken.deploy("usdc", "usdc", toMwei('10000000'), 6);
        await usdc.deployed();
        usdt = await MockToken.deploy("usdt", "usdt", toMwei('1000000'), 6);
        await usdt.deployed();
        dai = await MockToken.deploy("dai", "dai", toWei('1000000'), 18);
        await dai.deployed();
        mai = await MockToken.deploy("mai", "mai", toWei('1000000'), 18);
        await mai.deployed();
        usdp = await MockToken.deploy("usdp", "usdp", toMwei('1000000'), 18);
        await usdp.deployed();
        rew = await MockToken.deploy("rew", "rew", toWei('1000000'), 18);
        await rew.deployed();

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

        const DummyVeMnt = await ethers.getContractFactory("DummyVeMnt");
        dvemnt = await upgrades.deployProxy(DummyVeMnt, [], { initializer: 'initialize' });
        await dvemnt.deployed();

        const veMNT = await ethers.getContractFactory("veMNT");
        vemnt = await upgrades.deployProxy(veMNT, [mnt.address], { initializer: 'initialize' });
        await vemnt.deployed();

        const MasterMantis = await ethers.getContractFactory("MasterMantis");
        mm = await upgrades.deployProxy(MasterMantis, [mnt.address, dvemnt.address, mntPerBlock, await blockTimestamp()+86400*16], { initializer: 'initialize' });
        await mm.deployed();

        const LP = await ethers.getContractFactory("LP");
        lpusdc = await upgrades.deployProxy(LP, ["lpusdc", "lpusdc", usdc.address, pool.address, mm.address], { initializer: 'initialize'});
        await lpusdc.deployed();
        lpusdt = await upgrades.deployProxy(LP, ["lpusdt", "lpusdt", usdt.address, pool.address, mm.address], { initializer: 'initialize'});
        await lpusdt.deployed();
        lpdai = await upgrades.deployProxy(LP, ["lpdai", "lpdai", dai.address, pool.address, mm.address], { initializer: 'initialize'});
        await lpdai.deployed();
        lpmai = await upgrades.deployProxy(LP, ["lpmai", "lpmai", mai.address, pool.address, mm.address], { initializer: 'initialize'});
        await lpmai.deployed();
        lpusdp = await upgrades.deployProxy(LP, ["lpusdp", "lpusdp", usdp.address, pool.address, mm.address], { initializer: 'initialize'});
        await lpusdp.deployed();

        const Rewarder = await ethers.getContractFactory("Rewarder");
        rewarder = await Rewarder.deploy(rew.address, lpusdc.address, toWei("1"), mm.address);
        await rewarder.deployed();

        await pool.setTreasury(deployer);
        await pool.setMasterMantis(mm.address);
        await pool.addLP(usdc.address, lpusdc.address, usdcFeed.address);
        await pool.addLP(usdt.address, lpusdt.address, usdtFeed.address);
        await pool.addLP(dai.address, lpdai.address, usdtFeed.address);
        await pool.addLP(mai.address, lpmai.address, usdtFeed.address);
        await pool.addLP(usdp.address, lpusdp.address, usdtFeed.address);
        await pool.setSwapAllowed(true);

        await mm.add(10000, lpusdc.address);
        await mm.add(10000, lpusdt.address);
        await mm.add(9000, lpdai.address);
        await mm.add(8000, lpmai.address);
        await mm.add(5000, lpusdp.address);
        await mm.setRewarder(0, rewarder.address);
        await mm.setPoolContract(pool.address, true);

        await mm.setVeMnt(vemnt.address)
        await vemnt.addMasterMantis(mm.address)

        await usdc.transfer(user, toMwei('1000000'))
        await usdc.approve(pool.address, toMwei('10000000000'));
        await usdc.connect(userSigner).approve(pool.address, toMwei('10000000000'));
        await usdt.approve(pool.address, toMwei('10000000000'));
        await dai.approve(pool.address, toWei('10000000000'));
        await lpusdc.approve(mm.address, toMwei('10000000000'));
        await lpusdc.connect(userSigner).approve(mm.address, toMwei('10000000000'));
        await lpusdt.approve(mm.address, toMwei('10000000000'));
        await mnt.approve(vemnt.address, toWei('100000000'))

        await pool.deposit(usdc.address, deployer, toMwei('100000'), false, 2652351324);
        await pool.connect(userSigner).deposit(usdc.address, user, toMwei('100000'), false, 2652351324);
        await pool.deposit(usdt.address, deployer, toMwei('100000'), false, 2652351324);
        await pool.deposit(dai.address, deployer, toWei('110000'), false, 2652351324);

        await mm.deposit(deployer, 0, toMwei('10000'));
        await mnt.connect(treasurySigner).transfer(mm.address, toWei('100000'));
        await mnt.connect(treasurySigner).transfer(deployer, toWei('100000'));
        await rew.transfer(rewarder.address, toWei('10000'));

        currentTime = await blockTimestamp();
    });

    it("Test Deposit & Claim", async function () {
        await mineNBlocks(1000)
        await mm.massUpdatePools()
        const pendingRewards = parseFloat(fromWei((await mm.pendingMnt(0, deployer)).pendingMNT))
        const oldMntBalance = parseFloat(fromWei(await mnt.balanceOf(deployer)))
        await mm.claim([0])
        const midMntBalance = parseFloat(fromWei(await mnt.balanceOf(deployer)))
        expect(midMntBalance - oldMntBalance).to.be.closeTo(pendingRewards, pendingRewards / 100)

        await mm.deposit(deployer, 0, toMwei('10000'))
        await vemnt.deposit(deployer, toWei('10000'))
        const mid2MntBalance = parseFloat(fromWei(await mnt.balanceOf(deployer)))
        
        await mineNBlocks(1000)
        await increaseTime(86400)
        await vemnt.claim()
        await mm.claim([0]);
        const mid3MntBalance = parseFloat(fromWei(await mnt.balanceOf(deployer)))
        expect(mid3MntBalance - mid2MntBalance).to.be.closeTo(pendingRewards, pendingRewards / 100)

        await mm.connect(userSigner).deposit(user, 0, toMwei('20000'))
        await increaseTime(86400)
        await vemnt.claim()
        await mineNBlocks(1000)
        console.log(pendingRewards)
        console.log(parseFloat(fromWei((await mm.pendingMnt(0, deployer)).pendingMNT)))
        console.log(parseFloat(fromWei((await mm.pendingMnt(0, user)).pendingMNT)))
    });

    it("Test Withdraw", async function () {
        await mineNBlocks(1000)
        await mm.massUpdatePools()
        const pendingRewards = parseFloat(fromWei((await mm.pendingMnt(0, deployer)).pendingMNT))
        const oldMntBalance = parseFloat(fromWei(await mnt.balanceOf(deployer)))
        await mm.claim([0])
        const midMntBalance = parseFloat(fromWei(await mnt.balanceOf(deployer)))
        expect(midMntBalance - oldMntBalance).to.be.closeTo(pendingRewards, pendingRewards / 100)

        await mm.connect(userSigner).deposit(user, 0, toMwei('10000'))
        await mm.withdraw(0, toMwei('5000'))
        const mid2MntBalance = parseFloat(fromWei(await mnt.balanceOf(deployer)))
        
        await mineNBlocks(1000)
        console.log(pendingRewards)
        console.log(parseFloat(fromWei((await mm.pendingMnt(0, deployer)).pendingMNT)))
        console.log(parseFloat(fromWei((await mm.pendingMnt(0, user)).pendingMNT)))
    });

    // it("Gauge update", async function () {
    //     console.log(await mm.estimateGas.gaugeUpdate());
    // });

    it("Simulate voting", async function () {
        await mnt.connect(treasurySigner).transfer(deployer, toWei('100000'))
        await mnt.connect(treasurySigner).transfer(user, toWei('100000'))

        await mnt.approve(vemnt.address, toWei('10000000'))
        await mnt.connect(userSigner).approve(vemnt.address, toWei('10000000'))
        await vemnt.deposit(deployer, toWei('100000'))
        await vemnt.connect(userSigner).deposit(user, toWei('100000'))

        await increaseTime(8640000)

        await vemnt.claim()
        await vemnt.connect(userSigner).claim()

        await dai.approve(pool.address, toWei('100000000'))
        await pool.deposit(dai.address, deployer, toWei('50000'), false, 2652351324);
        await mm.gaugeUpdate()
        await increaseTime(8640000)
        await mm.gaugeUpdate()
        await poolLog();
        const votePayload = {
            "totalVotes": toWei('10000'),
            "votes": [{"pid": 0, "amount": toWei('3000')}, {"pid": 2, "amount": toWei('7000')}]
        }
        const votePayload2 = {
            "totalVotes": toWei('10000'),
            "votes": [{"pid": 3, "amount": toWei('10000')}]
        }
        await mm.vote(votePayload)
        await mm.connect(userSigner).vote(votePayload2)
        await increaseTime(8640000)
        await mm.gaugeUpdate()
        await poolLog();
        await increaseTime(8640000)
        await vemnt.withdraw(1)
        await mm.gaugeUpdate()
        await poolLog();
    });
});
