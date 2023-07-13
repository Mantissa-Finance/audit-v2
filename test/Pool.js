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
function toBytes32(num) {
	return ethers.utils.hexZeroPad(ethers.utils.hexlify(num), 32);
}

function getSlippage(lr) {
	if (lr <= 1) {
		return 0.8 * Math.exp(-16 * lr)
	} else {
		return 0.8 * (Math.exp(16 * (lr - 2)) - 2 * (Math.exp(-16) - Math.exp(-16 * lr)))
	}
}

const zeroAddress = '0x0000000000000000000000000000000000000000';

let deployer, treasury, user, other;
let pool, usdc, usdt, lpusdc, lpusdt;

describe("Pool", async function () {

	beforeEach(async function () {
		[deployerSigner, treasurySigner, userSigner, otherSigner] = await ethers.getSigners();
		deployer = deployerSigner.address
		treasury = treasurySigner.address
		user = userSigner.address
		other = otherSigner.address
		const MockToken = await ethers.getContractFactory("StableFake");
		usdc = await MockToken.deploy("usdc", "usdc", toMwei('10000000'), 6);
		await usdc.deployed();
		usdt = await MockToken.deploy("usdt", "usdt", toMwei('10000000'), 6);
		await usdt.deployed();
		dai = await MockToken.deploy("dai", "dai", toWei('10000000'), 18);
		await dai.deployed();

		const PoolHelper = await ethers.getContractFactory("PoolHelper");
		poolHelper = await PoolHelper.deploy();
		await poolHelper.deployed();

		// const MockAggregator = await ethers.getContractFactory("MockAggregator");
		// usdcFeed = await MockAggregator.deploy("100000000");
		// await usdcFeed.deployed();
		// usdtFeed = await MockAggregator.deploy("100001000");
		// await usdtFeed.deployed();
		// daiFeed = await MockAggregator.deploy("100000000");
		// await daiFeed.deployed();

		const MockAPI3Proxy = await ethers.getContractFactory("MockAPI3Proxy");
		const API3FeedReader = await ethers.getContractFactory("API3FeedReader");
		usdcProxy = await MockAPI3Proxy.deploy(toWei('1'))
		await usdcProxy.deployed()
		usdcFeed = await API3FeedReader.deploy(usdcProxy.address)
		await usdcFeed.deployed()

		usdtProxy = await MockAPI3Proxy.deploy(toWei('1'))
		await usdtProxy.deployed()
		usdtFeed = await API3FeedReader.deploy(usdtProxy.address)
		await usdtFeed.deployed()

		daiProxy = await MockAPI3Proxy.deploy(toWei('1'))
		await daiProxy.deployed()
		daiFeed = await API3FeedReader.deploy(daiProxy.address)
		await daiFeed.deployed()

		const Pool = await ethers.getContractFactory("Pool");
		pool = await upgrades.deployProxy(Pool, [zeroAddress, treasury, poolHelper.address], { initializer: 'initialize' });
		await pool.deployed();

		const MockFlashLoan = await ethers.getContractFactory("MockFlashLoan");
		flashLoan = await MockFlashLoan.deploy(pool.address);
		await flashLoan.deployed();

		const LP = await ethers.getContractFactory("LP");
		lpusdc = await upgrades.deployProxy(LP, ["lpusdc", "lpusdc", usdc.address, pool.address, zeroAddress], { initializer: 'initialize'});
		await lpusdc.deployed();
		lpusdt = await upgrades.deployProxy(LP, ["lpusdt", "lpusdt", usdt.address, pool.address, zeroAddress], { initializer: 'initialize'});
		await lpusdt.deployed();
		lpdai = await upgrades.deployProxy(LP, ["lpdai", "lpdai", dai.address, pool.address, zeroAddress], { initializer: 'initialize'});
		await lpdai.deployed();

		await pool.setTreasury(treasury);
		await pool.addLP(usdc.address, lpusdc.address, usdcFeed.address);
		await pool.addLP(usdt.address, lpusdt.address, usdtFeed.address);
		await pool.addLP(dai.address, lpdai.address, daiFeed.address);

		await usdc.approve(pool.address, toMwei('10000000000'));
		await usdt.approve(pool.address, toMwei('10000000000'));
		await dai.approve(pool.address, toWei('10000000000'));
		await lpusdc.approve(pool.address, toMwei('10000000000'));
		await lpusdt.approve(pool.address, toMwei('10000000000'));
		await lpdai.approve(pool.address, toWei('10000000000'));
		await pool.deposit(usdc.address, deployer, toMwei('100000'), false, 2652351324);
		await pool.deposit(usdt.address, deployer, toMwei('100000'), false, 2652351324);
		await pool.deposit(dai.address, deployer, toWei('100000'), false, 2652351324);
        await pool.setSwapAllowed(true);
	});

	it("Test Slippage", async function () {
		let slippage1 = getSlippage(1);
		let slippage2 = getSlippage(1.1)
		let slippage3 = getSlippage(0.9)
		expect(parseFloat(fromWei(await poolHelper.getSlippage(toWei('1'), 8, 16, toWei('1'))))).to.be.closeTo(slippage1, slippage1 / 1000)
		expect(parseFloat(fromWei(await poolHelper.getSlippage(toWei('1.1'), 8, 16, toWei('1'))))).to.be.closeTo(slippage2, slippage3 / 1000)
		expect(parseFloat(fromWei(await poolHelper.getSlippage(toWei('0.9'), 8, 16, toWei('1'))))).to.be.closeTo(slippage3, slippage3 / 1000)
		let slippage4 = getSlippage(1.99)
		let slippage5 = getSlippage(2)
		let slippage6 = getSlippage(2.01)
		let slippage7 = getSlippage(2.2)
		let slippage8 = getSlippage(3)
		expect(parseFloat(fromWei(await poolHelper.getSlippage(toWei('1.99'), 8, 16, toWei('1'))))).to.be.closeTo(slippage4, slippage4 / 1000)
		expect(parseFloat(fromWei(await poolHelper.getSlippage(toWei('2'), 8, 16, toWei('1'))))).to.be.closeTo(slippage5, slippage5 / 1000)
		expect(parseFloat(fromWei(await poolHelper.getSlippage(toWei('2.01'), 8, 16, toWei('1'))))).to.be.closeTo(slippage6, slippage6 / 1000)
		expect(parseFloat(fromWei(await poolHelper.getSlippage(toWei('2.2'), 8, 16, toWei('1'))))).to.be.closeTo(slippage7, slippage7 / 1000)
		expect(parseFloat(fromWei(await poolHelper.getSlippage(toWei('3'), 8, 16, toWei('1'))))).to.be.closeTo(slippage8, slippage8 / 1000)
	});

	it("Test Swap 1:1 usdc-usdt", async function () {
		const swapAmount = 10000;
		let oldFromSlippage = getSlippage(1);
		let oldToSlippage = getSlippage(1);
		let newFromSlippage = getSlippage(1.1)
		let newToSlippage = getSlippage(0.9)
		let calculatedSlippage = ((newFromSlippage - oldFromSlippage) / (0.1)) + ((newToSlippage - oldToSlippage) / (0.1))
		let finalAmount = swapAmount * (1 - calculatedSlippage)
		let feeAmount = finalAmount * 0.0001
		let toAmount = finalAmount - feeAmount;
		let treasuryFees = feeAmount * 0

		const data = await pool.getSwapAmount(lpusdc.address, lpusdt.address, toMwei('10000'), false, 0, 0);
		// console.log(data)
		expect(parseFloat(fromMwei(data.toAmount))).to.be.closeTo(toAmount, toAmount / 1000)
		expect(parseFloat(fromMwei(data.feeAmount))).to.be.closeTo(feeAmount, feeAmount / 1000)
		expect(parseFloat(fromMwei(data.treasuryFees))).to.be.closeTo(treasuryFees, treasuryFees / 1000)
		expect(parseFloat(fromMwei(data.lpAmount))).to.be.closeTo(0, 0)

		const oldUsdcUserBalance = parseFloat(fromMwei(await usdc.balanceOf(deployer)))
		const oldUsdtUserBalance = parseFloat(fromMwei(await usdt.balanceOf(deployer)))
		const oldUsdtTreasuryBalance = parseFloat(fromMwei(await usdt.balanceOf(treasury)))
		await pool.swap(usdc.address, usdt.address, deployer, toMwei('10000'), 0, 2652351324);
		const newUsdcUserBalance = parseFloat(fromMwei(await usdc.balanceOf(deployer)))
		const newUsdtUserBalance = parseFloat(fromMwei(await usdt.balanceOf(deployer)))
		const newUsdtTreasuryBalance = parseFloat(fromMwei(await usdt.balanceOf(treasury)))

		expect(oldUsdcUserBalance - newUsdcUserBalance).to.be.eq(10000)
		expect(newUsdtUserBalance - oldUsdtUserBalance).to.be.closeTo(toAmount, toAmount / 1000)
		expect(newUsdtTreasuryBalance - oldUsdtTreasuryBalance).to.be.closeTo(treasuryFees, treasuryFees / 1000)
	});

	it("Test Swap 1:1 usdc-dai", async function () {
		const swapAmount = 10000;
		let oldFromSlippage = getSlippage(1);
		let oldToSlippage = getSlippage(1);
		let newFromSlippage = getSlippage(1.1)
		let newToSlippage = getSlippage(0.9)
		let calculatedSlippage = ((newFromSlippage - oldFromSlippage) / (0.1)) + ((newToSlippage - oldToSlippage) / (0.1))
		let finalAmount = swapAmount * (1 - calculatedSlippage)
		let feeAmount = finalAmount * 0.0001
		let toAmount = finalAmount - feeAmount;
		let treasuryFees = feeAmount * 0

		const data = await pool.getSwapAmount(lpusdc.address, lpdai.address, toMwei('10000'), false, 0, 0);
		// console.log(data)
		expect(parseFloat(fromWei(data.toAmount))).to.be.closeTo(toAmount, toAmount / 1000)
		expect(parseFloat(fromWei(data.feeAmount))).to.be.closeTo(feeAmount, feeAmount / 1000)
		expect(parseFloat(fromWei(data.treasuryFees))).to.be.closeTo(treasuryFees, treasuryFees / 1000)
		expect(parseFloat(fromWei(data.lpAmount))).to.be.closeTo(0, 0)

		const oldUsdcUserBalance = parseFloat(fromMwei(await usdc.balanceOf(deployer)))
		const oldDaiUserBalance = parseFloat(fromWei(await dai.balanceOf(deployer)))
		const oldDaiTreasuryBalance = parseFloat(fromWei(await dai.balanceOf(treasury)))
		await pool.swap(usdc.address, dai.address, deployer, toMwei('10000'), 0, 2652351324);
		const newUsdcUserBalance = parseFloat(fromMwei(await usdc.balanceOf(deployer)))
		const newDaiUserBalance = parseFloat(fromWei(await dai.balanceOf(deployer)))
		const newDaiTreasuryBalance = parseFloat(fromWei(await dai.balanceOf(treasury)))

		expect(oldUsdcUserBalance - newUsdcUserBalance).to.be.eq(10000)
		expect(newDaiUserBalance - oldDaiUserBalance).to.be.closeTo(toAmount, toAmount / 1000)
		expect(newDaiTreasuryBalance - oldDaiTreasuryBalance).to.be.closeTo(treasuryFees, treasuryFees / 1000)
	});

	it("Test Swap 1:1 dai-usdt", async function () {
		const swapAmount = 10000;
		let oldFromSlippage = getSlippage(1);
		let oldToSlippage = getSlippage(1);
		let newFromSlippage = getSlippage(1.1)
		let newToSlippage = getSlippage(0.9)
		let calculatedSlippage = ((newFromSlippage - oldFromSlippage) / (0.1)) + ((newToSlippage - oldToSlippage) / (0.1))
		let finalAmount = swapAmount * (1 - calculatedSlippage)
		let feeAmount = finalAmount * 0.0001
		let toAmount = finalAmount - feeAmount;
		let treasuryFees = feeAmount * 0

		const data = await pool.getSwapAmount(lpdai.address, lpusdt.address, toWei('10000'), false, 0, 0);
		// console.log(data)
		expect(parseFloat(fromMwei(data.toAmount))).to.be.closeTo(toAmount, toAmount / 1000)
		expect(parseFloat(fromMwei(data.feeAmount))).to.be.closeTo(feeAmount, feeAmount / 1000)
		expect(parseFloat(fromMwei(data.treasuryFees))).to.be.closeTo(treasuryFees, treasuryFees / 1000)
		expect(parseFloat(fromMwei(data.lpAmount))).to.be.closeTo(0, 0)

		const oldDaiUserBalance = parseFloat(fromWei(await dai.balanceOf(deployer)))
		const oldUsdtUserBalance = parseFloat(fromMwei(await usdt.balanceOf(deployer)))
		const oldUsdtTreasuryBalance = parseFloat(fromMwei(await usdt.balanceOf(treasury)))
		await pool.swap(dai.address, usdt.address, deployer, toWei('10000'), 0, 2652351324);
		const newDaiUserBalance = parseFloat(fromWei(await dai.balanceOf(deployer)))
		const newUsdtUserBalance = parseFloat(fromMwei(await usdt.balanceOf(deployer)))
		const newUsdtTreasuryBalance = parseFloat(fromMwei(await usdt.balanceOf(treasury)))

		expect(oldDaiUserBalance - newDaiUserBalance).to.be.eq(10000)
		expect(newUsdtUserBalance - oldUsdtUserBalance).to.be.closeTo(toAmount, toAmount / 1000)
		expect(newUsdtTreasuryBalance - oldUsdtTreasuryBalance).to.be.closeTo(treasuryFees, treasuryFees / 1000)
	});

	it("Test Swap LP fees", async function () {
		await expect(pool.setLpRatio(101)).to.be.revertedWith('> baseFee')
		await pool.setLpRatio(80)
		const swapAmount = 10000;
		let oldFromSlippage = getSlippage(1);
		let oldToSlippage = getSlippage(1);
		let newFromSlippage = getSlippage(1.1)
		let newToSlippage = getSlippage(0.9)
		let calculatedSlippage = ((newFromSlippage - oldFromSlippage) / (0.1)) + ((newToSlippage - oldToSlippage) / (0.1))
		let finalAmount = swapAmount * (1 - calculatedSlippage)
		let feeAmount = finalAmount * 0.0001 * 0.2
		let lpAmount = finalAmount * 0.00008
		let toAmount = finalAmount - feeAmount - lpAmount;
		let treasuryFees = feeAmount * 0

		const data = await pool.getSwapAmount(lpusdc.address, lpusdt.address, toMwei('10000'), false, 0, 0);
		// console.log(data)
		expect(parseFloat(fromMwei(data.toAmount))).to.be.closeTo(toAmount, toAmount / 1000)
		expect(parseFloat(fromMwei(data.feeAmount))).to.be.closeTo(feeAmount, feeAmount / 1000)
		expect(parseFloat(fromMwei(data.treasuryFees))).to.be.closeTo(treasuryFees, treasuryFees / 1000)
		expect(parseFloat(fromMwei(data.lpAmount))).to.be.closeTo(lpAmount, lpAmount / 1000)

		const oldUsdcUserBalance = parseFloat(fromMwei(await usdc.balanceOf(deployer)))
		const oldUsdtUserBalance = parseFloat(fromMwei(await usdt.balanceOf(deployer)))
		const oldUsdtTreasuryBalance = parseFloat(fromMwei(await usdt.balanceOf(treasury)))
		await pool.swap(usdc.address, usdt.address, deployer, toMwei('10000'), 0, 2652351324);
		const newUsdcUserBalance = parseFloat(fromMwei(await usdc.balanceOf(deployer)))
		const newUsdtUserBalance = parseFloat(fromMwei(await usdt.balanceOf(deployer)))
		const newUsdtTreasuryBalance = parseFloat(fromMwei(await usdt.balanceOf(treasury)))

		expect(oldUsdcUserBalance - newUsdcUserBalance).to.be.eq(10000)
		expect(newUsdtUserBalance - oldUsdtUserBalance).to.be.closeTo(toAmount, toAmount / 1000)
		expect(newUsdtTreasuryBalance - oldUsdtTreasuryBalance).to.be.closeTo(treasuryFees, treasuryFees / 1000)

		console.log(await pool.getWithdrawAmount(lpusdt.address, toMwei('1000'), false))
	});

	it("Test Deposit usdc", async function () {
		await pool.swap(usdc.address, usdt.address, deployer, toMwei('20000'), 0, 2652351324);
		const usdtData = await pool.getDepositAmount(lpusdt.address, toMwei('10000'), false, 0)
		expect(parseFloat(fromMwei(usdtData.lpAmount))).to.be.closeTo(10000, 1)
		expect(usdtData.fees).to.be.eq(0)

		const maxLR = 1.2
		const liability = 100000
		const deposit = 10000
		let newLR = 13 / 11

		let fees = (liability + deposit) * (getSlippage(newLR) - getSlippage((maxLR*liability+deposit) / (liability+deposit))) + liability*(getSlippage(maxLR) - getSlippage(1.2))
		let treasuryFees = fees * 0.4
		const usdcData = await pool.getDepositAmount(lpusdc.address, toMwei('10000'), false, 0)
		expect(parseFloat(fromMwei(usdcData.fees))).to.be.closeTo(fees, fees / 1000)
		expect(parseFloat(fromMwei(usdcData.lpAmount))).to.be.closeTo(deposit-fees, (deposit-fees) / 1000)
		expect(parseFloat(fromMwei(usdcData.treasuryFees))).to.be.closeTo(treasuryFees, treasuryFees / 1000)
	});

	it("Test Deposit dai", async function () {
		await pool.swap(dai.address, usdt.address, deployer, toWei('20000'), 0, 2652351324);

		const maxLR = 1.2
		const liability = 100000
		const deposit = 10000
		let newLR = 13 / 11

		let fees = (liability + deposit) * (getSlippage(newLR) - getSlippage((maxLR*liability+deposit) / (liability+deposit))) + liability*(getSlippage(maxLR) - getSlippage(1.2))
		let treasuryFees = fees * 0.4
		const daiData = await pool.getDepositAmount(lpdai.address, toWei('10000'), false, 0)
		expect(parseFloat(fromWei(daiData.fees))).to.be.closeTo(fees, fees / 1000)
		expect(parseFloat(fromWei(daiData.lpAmount))).to.be.closeTo(deposit-fees, (deposit-fees) / 1000)
		expect(parseFloat(fromWei(daiData.treasuryFees))).to.be.closeTo(treasuryFees, treasuryFees / 1000)
	});

	it("Test Withdraw usdt", async function () {
		await pool.swap(usdc.address, usdt.address, deployer, toMwei('10000'), 0, 2652351324);
		const usdcData = await pool.getWithdrawAmount(lpusdc.address, toMwei('10000'), false)
		expect(parseFloat(fromMwei(usdcData.amount))).to.be.closeTo(10000, 1)
		expect(usdcData.fees).to.be.eq(0)

		const liability = 100000
		const asset = parseFloat(fromMwei(await lpusdt.asset()))
		const withdraw = 10000
		const currentLR = asset / liability
		const newLR = (asset - withdraw) / (liability - withdraw)

		let fees = (liability - withdraw) * (getSlippage(newLR) - getSlippage(currentLR))
		let treasuryFees = fees * 0.4
		const usdtData = await pool.getWithdrawAmount(lpusdt.address, toMwei('10000'), false)
		expect(parseFloat(fromMwei(usdtData.fees))).to.be.closeTo(fees, fees / 1000)
		expect(parseFloat(fromMwei(usdtData.amount))).to.be.closeTo(withdraw-fees, (withdraw-fees) / 1000)
		expect(parseFloat(fromMwei(usdtData.treasuryFees))).to.be.closeTo(treasuryFees, treasuryFees / 1000)
	});

	it("Test Withdraw dai", async function () {
		await pool.swap(usdc.address, dai.address, deployer, toMwei('10000'), 0, 2652351324);
		const usdcData = await pool.getWithdrawAmount(lpusdc.address, toMwei('10000'), false)
		expect(parseFloat(fromMwei(usdcData.amount))).to.be.closeTo(10000, 1)
		expect(usdcData.fees).to.be.eq(0)

		const liability = 100000
		const asset = parseFloat(fromWei(await lpdai.asset()))
		const withdraw = 10000
		const currentLR = asset / liability
		const newLR = (asset - withdraw) / (liability - withdraw)

		let fees = (liability - withdraw) * (getSlippage(newLR) - getSlippage(currentLR))
		let treasuryFees = fees * 0.4
		const daiData = await pool.getWithdrawAmount(lpdai.address, toWei('10000'), false)
		expect(parseFloat(fromWei(daiData.fees))).to.be.closeTo(fees, fees / 1000)
		expect(parseFloat(fromWei(daiData.amount))).to.be.closeTo(withdraw-fees, (withdraw-fees) / 1000)
		expect(parseFloat(fromWei(daiData.treasuryFees))).to.be.closeTo(treasuryFees, treasuryFees / 1000)
	});

	it("Test Withdraw other", async function () {
		await pool.swap(usdt.address, usdc.address, deployer, toMwei('10000'), 0, 2652351324);
		await pool.swap(dai.address, usdc.address, deployer, toWei('1000'), 0, 2652351324);
		await expect(pool.withdrawOther(usdt.address, usdc.address, deployer, toMwei('10000'), 0, 2652351324))
			.to.be.revertedWith("LR low");
		await expect(pool.withdrawOther(usdt.address, dai.address, deployer, toMwei('100'), 0, 2652351324))
			.to.be.revertedWith("From LR higher");
		await expect(pool.withdrawOther(usdc.address, dai.address, deployer, toMwei('1500'), 0, 2652351324))
			.to.be.revertedWith("LR low");
		await expect(pool.withdrawOther(dai.address, usdt.address, deployer, toWei('5000'), 0, 2652351324))
			.to.be.revertedWith("From LR higher");
		await pool.swap(usdc.address, dai.address, deployer, toMwei('3000'), 0, 2652351324);
		await expect(pool.withdrawOther(usdc.address, usdt.address, deployer, toMwei('9500'), 0, 2652351324))
			.to.be.revertedWith("From LR higher");

		const data1 = await pool.getWithdrawAmountOtherToken(lpusdc.address, lpusdt.address, toMwei('1000'))
		expect(parseFloat(fromMwei(data1.amount))).to.be.closeTo(1000, 1)
		expect(parseFloat(fromMwei(data1.otherAmount))).to.be.closeTo(1000, 1)

		const data2 = await pool.getWithdrawAmountOtherToken(lpdai.address, lpusdt.address, toWei('1000'))
		expect(parseFloat(fromWei(data2.amount))).to.be.closeTo(1000, 1)
		expect(parseFloat(fromMwei(data2.otherAmount))).to.be.closeTo(1000, 1)

		await pool.swap(dai.address, usdc.address, deployer, toWei('3000'), 0, 2652351324);


		oldLpUsdcBalance = parseFloat(fromMwei(await lpusdc.balanceOf(deployer)))
		oldLpDaiBalance = parseFloat(fromWei(await lpdai.balanceOf(deployer)))
		oldUsdcBalance = parseFloat(fromMwei(await usdc.balanceOf(deployer)))
		oldDaiBalance = parseFloat(fromWei(await dai.balanceOf(deployer)))
		oldFromAsset = parseFloat(fromMwei(await lpusdc.asset()))
		oldFromLiability = parseFloat(fromMwei(await lpusdc.liability()))
		oldToAsset = parseFloat(fromWei(await lpdai.asset()))
		oldToLiability = parseFloat(fromWei(await lpdai.liability()))

		withdrawData = await pool.getWithdrawAmount(lpusdc.address, toMwei('1000'), false)
		amount = parseFloat(fromMwei(withdrawData.amount))
		fees = parseFloat(fromMwei(withdrawData.fees))
		finalAmount = amount - fees
		treasuryFees = parseFloat(fromMwei(withdrawData.treasuryFees))
		midFromAsset = oldFromAsset - finalAmount - treasuryFees
		expectedFromLiability = oldFromLiability - amount

		swapData = await pool.getSwapAmount(lpusdc.address, lpdai.address, toMwei(finalAmount.toFixed(6)),
			true, toMwei(midFromAsset.toFixed(6)), toMwei(expectedFromLiability.toFixed(6)))
		toAmount = parseFloat(fromWei(swapData.toAmount))

		expectedFromAsset = midFromAsset + finalAmount
		expectedToAsset = oldToAsset - toAmount

		await pool.withdrawOther(usdc.address, dai.address, deployer, toMwei('1000'), 0, 2652351324)
		
		newFromAsset = parseFloat(fromMwei(await lpusdc.asset()))
		newFromLiability = parseFloat(fromMwei(await lpusdc.liability()))
		newToAsset = parseFloat(fromWei(await lpdai.asset()))
		newToLiability = parseFloat(fromWei(await lpdai.liability()))
		newLpUsdcBalance = parseFloat(fromMwei(await lpusdc.balanceOf(deployer)))
		newLpDaiBalance = parseFloat(fromWei(await lpdai.balanceOf(deployer)))
		newUsdcBalance = parseFloat(fromMwei(await usdc.balanceOf(deployer)))
		newDaiBalance = parseFloat(fromWei(await dai.balanceOf(deployer)))

		expect(oldLpUsdcBalance - newLpUsdcBalance).to.be.closeTo(1000, 0.1)
		expect(newLpDaiBalance - oldLpDaiBalance).to.be.closeTo(0, 0.0001)
		expect(newUsdcBalance - oldUsdcBalance).to.be.closeTo(0, 0.0001)
		expect(newDaiBalance - oldDaiBalance).to.be.closeTo(toAmount, toAmount / 10000)

		expect(newFromAsset).to.be.closeTo(expectedFromAsset, expectedFromAsset / 10000)
		expect(newFromLiability).to.be.closeTo(expectedFromLiability, expectedFromLiability / 10000)
		expect(newToAsset).to.be.closeTo(expectedToAsset, expectedToAsset / 10000)
		expect(newToLiability).to.be.eq(oldToLiability)
	});

	it("Test Withdraw other imbalance", async function () {
		await pool.swap(usdc.address, dai.address, deployer, toMwei('60000'), 0, 2652351324);

		oldLpUsdcBalance = parseFloat(fromMwei(await lpusdc.balanceOf(deployer)))
		oldLpDaiBalance = parseFloat(fromWei(await lpdai.balanceOf(deployer)))
		oldUsdcBalance = parseFloat(fromMwei(await usdc.balanceOf(deployer)))
		oldDaiBalance = parseFloat(fromWei(await dai.balanceOf(deployer)))
		oldFromAsset = parseFloat(fromWei(await lpdai.asset()))
		oldFromLiability = parseFloat(fromWei(await lpdai.liability()))
		oldToAsset = parseFloat(fromMwei(await lpusdc.asset()))
		oldToLiability = parseFloat(fromMwei(await lpusdc.liability()))

		withdrawData = await pool.getWithdrawAmount(lpdai.address, toWei('10000'), false)
		amount = parseFloat(fromWei(withdrawData.amount))
		fees = parseFloat(fromWei(withdrawData.fees))
		finalAmount = amount - fees
		treasuryFees = parseFloat(fromWei(withdrawData.treasuryFees))
		midFromAsset = oldFromAsset - finalAmount - treasuryFees
		expectedFromLiability = oldFromLiability - amount

		swapData = await pool.getSwapAmount(lpdai.address, lpusdc.address, toWei(finalAmount.toFixed(18)),
			true, toWei(midFromAsset.toFixed(18)), toWei(expectedFromLiability.toFixed(18)))
		toAmount = parseFloat(fromMwei(swapData.toAmount))

		expectedFromAsset = midFromAsset + finalAmount
		expectedToAsset = oldToAsset - toAmount

		await pool.withdrawOther(dai.address, usdc.address, deployer, toWei('10000'), 0, 2652351324)
		
		newFromAsset = parseFloat(fromWei(await lpdai.asset()))
		newFromLiability = parseFloat(fromWei(await lpdai.liability()))
		newToAsset = parseFloat(fromMwei(await lpusdc.asset()))
		newToLiability = parseFloat(fromMwei(await lpusdc.liability()))
		newLpUsdcBalance = parseFloat(fromMwei(await lpusdc.balanceOf(deployer)))
		newLpDaiBalance = parseFloat(fromWei(await lpdai.balanceOf(deployer)))
		newUsdcBalance = parseFloat(fromMwei(await usdc.balanceOf(deployer)))
		newDaiBalance = parseFloat(fromWei(await dai.balanceOf(deployer)))

		expect(oldLpDaiBalance - newLpDaiBalance).to.be.closeTo(10000, 0.1)
		expect(newLpUsdcBalance - oldLpUsdcBalance).to.be.closeTo(0, 0.0001)
		expect(newDaiBalance - oldDaiBalance).to.be.closeTo(0, 0.0001)
		expect(newUsdcBalance - oldUsdcBalance).to.be.closeTo(toAmount, toAmount / 10000)

		expect(newFromAsset).to.be.closeTo(expectedFromAsset, expectedFromAsset / 10000)
		expect(newFromLiability).to.be.closeTo(expectedFromLiability, expectedFromLiability / 10000)
		expect(newToAsset).to.be.closeTo(expectedToAsset, expectedToAsset / 10000)
		expect(newToLiability).to.be.eq(oldToLiability)
	});

	it("Simulate Withdraw other vs Swap", async function () {
		await pool.swap(usdt.address, usdc.address, deployer, toMwei('10000'), 0, 2652351324);
		console.log("from LR = ", fromWei(await lpusdc.getLR()))
		console.log("to LR = ", fromWei(await lpusdt.getLR()))
		const swapData = await pool.getSwapAmount(lpusdc.address, lpusdt.address, toMwei('1000'), false, 0, 0)
		console.log("Swap = ", fromMwei(swapData.toAmount))
		const oldLpUsdcBalance = parseFloat(fromMwei(await lpusdc.balanceOf(deployer)))
		const oldUsdtBalance = parseFloat(fromMwei(await usdt.balanceOf(deployer)))
		await pool.deposit(usdc.address, deployer, toMwei('1000'), false, 2652351324)
		const newLpUsdcBalance = parseFloat(fromMwei(await lpusdc.balanceOf(deployer)))
		const lpAmount = newLpUsdcBalance - oldLpUsdcBalance
		await pool.withdrawOther(usdc.address, usdt.address, deployer, toMwei(lpAmount.toString()), 0, 2652351324)
		const newUsdtBalance = parseFloat(fromMwei(await usdt.balanceOf(deployer)))
		console.log("Withdraw other = ", newUsdtBalance - oldUsdtBalance)
	});

	it("Test One Tap", async function () {
		await pool.swap(usdc.address, usdt.address, deployer, toMwei('10000'), 0, 2652351324);

		let usdcAsset = parseFloat(fromMwei(await lpusdc.asset()))
		let usdtAsset = parseFloat(fromMwei(await lpusdt.asset()))
		let usdcLiability = parseFloat(fromMwei(await lpusdc.liability()))
		let usdtLiability = parseFloat(fromMwei(await lpusdt.liability()))

		const withdraw = 1000
		let currentLR = usdtAsset / usdtLiability
		let newLR = (usdtAsset - withdraw) / (usdtLiability - withdraw)
		let withdrawFees = (usdtLiability - withdraw) * (getSlippage(newLR) - getSlippage(currentLR)) * 0.8
		let withdrawTreasuryFees = withdrawFees * 0.4
		let withdrawnAmount = withdraw - withdrawFees

		usdtAsset -= (withdrawnAmount + withdrawTreasuryFees)
		usdtLiability -= withdraw

		let r10 = usdtAsset / usdtLiability;
		let r20 = usdcAsset / usdcLiability;
		let r11 = (usdtAsset + withdrawnAmount) / usdtLiability;
		let r21 = (usdcAsset - withdrawnAmount) / usdcLiability;
		let oldFromSlippage = getSlippage(r10);
		let oldToSlippage = getSlippage(r20);
		let newFromSlippage = getSlippage(r11)
		let newToSlippage = getSlippage(r21)
		let calculatedSlippage = ((newFromSlippage - oldFromSlippage) / (r11-r10)) + ((newToSlippage - oldToSlippage) / (r21-r20))
		let swapFinalAmount = withdrawnAmount * (1 - calculatedSlippage)
		let swapFeeAmount = swapFinalAmount * 0.0001
		let toAmount = swapFinalAmount - swapFeeAmount;
		let swapTreasuryFees = swapFeeAmount * 0

		usdtAsset += withdrawnAmount
		usdcAsset -= (toAmount + swapTreasuryFees)

		let maxLR = 1.1
		newLR = (usdcAsset + toAmount) / (usdcLiability + toAmount)
		let depositFees = ((usdcLiability + toAmount) * (getSlippage(newLR) - getSlippage((maxLR*usdcLiability+toAmount) / (usdcLiability+toAmount))) + usdcLiability*(getSlippage(maxLR) - getSlippage(usdcAsset / usdcLiability)) ) * 0.8
		let depositTreasuryFees = depositFees * 0.4
		
		usdcAsset += toAmount - depositTreasuryFees
		usdcLiability += toAmount - depositFees

		const data = await pool.getOneTapAmount(lpusdt.address, lpusdc.address, toMwei('1000'))

		expect(parseFloat(fromMwei(data.withdrawAmount))).to.be.closeTo(withdrawnAmount, withdrawnAmount / 1000)
		expect(parseFloat(fromMwei(data.withdrawFees))).to.be.closeTo(withdrawFees, withdrawFees / 1000)
		expect(parseFloat(fromMwei(data.depositLpAmount))).to.be.closeTo((toAmount - depositFees), (toAmount - depositFees) / 1000)
		expect(parseFloat(fromMwei(data.depositFees))).to.be.closeTo(depositFees, depositFees / 100)
		expect(parseFloat(fromMwei(data.fromTreasuryFees))).to.be.closeTo(withdrawTreasuryFees, withdrawTreasuryFees / 100)
		expect(parseFloat(fromMwei(data.toTreasuryFees))).to.be.closeTo((swapTreasuryFees+depositTreasuryFees), (swapTreasuryFees+depositTreasuryFees) / 50)

		expect(parseFloat(fromMwei(data.fromAsset))).to.be.closeTo(usdtAsset, usdtAsset / 1000)
		expect(parseFloat(fromMwei(data.fromLiability))).to.be.closeTo(usdtLiability, usdtLiability / 1000)
		expect(parseFloat(fromMwei(data.toAsset))).to.be.closeTo(usdcAsset, usdcAsset / 1000)
		expect(parseFloat(fromMwei(data.toLiability))).to.be.closeTo(usdcLiability, usdcLiability / 1000)

		await pool.oneTap(usdt.address, usdc.address, deployer, toMwei('1000'), 0, false, false)

		expect(await lpusdt.asset()).to.be.eq(data.fromAsset)
		expect(await lpusdt.liability()).to.be.eq(data.fromLiability)
		expect(await lpusdc.asset()).to.be.eq(data.toAsset)
		expect(await lpusdc.liability()).to.be.eq(data.toLiability)
	});

	it("Simulate One Tap", async function () {
		console.log(await pool.getNetLiquidityRatio());
		// console.log(await usdt.balanceOf(deployer))
		await pool.swap(usdc.address, usdt.address, deployer, toMwei('40000'), 0, 2652351324);
		// console.log(await usdt.balanceOf(deployer))
		console.log(await pool.getNetLiquidityRatio());
		const oldLpusdc = await lpusdc.balanceOf(deployer);
		const oldLpusdt = await lpusdt.balanceOf(deployer);
		console.log(oldLpusdc)
		console.log(oldLpusdt)
		console.log("usdc cov = ", await lpusdc.asset() / await lpusdc.liability());
		console.log("usdt cov = ", await lpusdt.asset() / await lpusdt.liability());
		const data = await pool.getOneTapAmount(lpusdt.address, lpusdc.address, toMwei('10000'));
		// console.log(data)
		await pool.oneTap(usdt.address, usdc.address, deployer, toMwei('10000'), 0, false, false)
		console.log(await pool.estimateGas.oneTap(usdt.address, usdc.address, deployer, toMwei('10000'), 0, false, false))
		console.log(await pool.getNetLiquidityRatio());
		// const newLpusdc = await lpusdc.balanceOf(deployer);
		// const newLpusdt = await lpusdt.balanceOf(deployer);
		// console.log(newLpusdc)
		// console.log(newLpusdt);
		console.log("usdc cov = ", await lpusdc.asset() / await lpusdc.liability());
		console.log("usdt cov = ", await lpusdt.asset() / await lpusdt.liability());

		await pool.oneTap(usdt.address, usdc.address, deployer, toMwei('10000'), 0, false, false)
		console.log(await pool.getNetLiquidityRatio());
		console.log("usdc cov = ", await lpusdc.asset() / await lpusdc.liability());
		console.log("usdt cov = ", await lpusdt.asset() / await lpusdt.liability());
		await pool.oneTap(usdt.address, usdc.address, deployer, toMwei('10000'), 0, false, false)
		console.log(await pool.getNetLiquidityRatio());
		console.log("usdc cov = ", await lpusdc.asset() / await lpusdc.liability());
		console.log("usdt cov = ", await lpusdt.asset() / await lpusdt.liability());

		// await pool.swap(usdc.address, usdt.address, deployer, toMwei('30000'), 0, 2652351324);
		// console.log(await pool.getNetLiquidityRatio());
		// console.log("usdc cov = ", await lpusdc.asset() / await lpusdc.liability());
		// console.log("usdt cov = ", await lpusdt.asset() / await lpusdt.liability());

		// await pool.oneTap(usdt.address, usdc.address, deployer, toMwei('10000'), 0, false, false)
		// console.log(await pool.getNetLiquidityRatio());
		// console.log("usdc cov = ", await lpusdc.asset() / await lpusdc.liability());
		// console.log("usdt cov = ", await lpusdt.asset() / await lpusdt.liability());

		// console.log("-----------")
		// console.log("usdc", await lpusdc.liability());
		// console.log("usdt", await lpusdt.liability());
		// console.log(await lpusdc.totalSupply());
		// console.log(await lpusdt.totalSupply());
	});

	it("Simulate Risk", async function () {
        let toAmount = 4000.0
        while (toAmount > 3800.0) {
            await pool.swap(usdt.address, usdc.address, deployer, toMwei('4000'), 0, 2652351324);
            const swapData = await pool.getSwapAmount(lpusdt.address, lpusdc.address, toMwei('4000'), false, 0, 2652351324)
            toAmount = parseFloat(fromMwei(swapData.toAmount))
            console.log(toAmount)
            console.log(fromWei(await lpusdt.getLR()))
            // console.log(fromWei(await lpusdc.getLR()))
            // console.log(fromWei(await pool.checkRiskValue(lpusdt.address, lpusdc.address, toMwei('1000'))))
            console.log(await lpusdt.getMaxLR())
            // console.log(await pool.getDepositAmount(lpusdt.address, toMwei('1000'), false, 0))
            // console.log(await pool.getWithdrawAmount(lpusdc.address, toMwei('1000'), false))
        }
        await pool.swap(usdc.address, usdt.address, deployer, toMwei('20000'), 0, 2652351324);
        console.log(fromWei(await lpusdt.getLR()))
        // console.log(fromWei(await lpusdc.getLR()))
        await pool.setRiskProfile(usdt.address, toWei('0.9'))
        console.log(await pool.checkRiskProfile(lpusdt.address, lpusdc.address, toMwei('1000')))
        console.log(await lpusdt.getMaxLR())
        console.log(await pool.getDepositAmount(lpusdt.address, toMwei('1000'), false, 0))
        // console.log(await pool.getSwapAmount(lpusdt.address, lpusdc.address, toMwei('4000'), false, 0, 2652351324));
    });

    it("Test Deposit limit", async function () {
    	await expect(pool.deposit(usdc.address, deployer, toMwei('2000000'), false, 2652351324)).to.be.revertedWith('LP Limit Reached');
    	await expect(pool.deposit(usdc.address, deployer, toMwei('1900001'), false, 2652351324)).to.be.revertedWith('LP Limit Reached');
    	await pool.deposit(usdc.address, deployer, toMwei('1900000'), false, 2652351324)
    	await expect(pool.deposit(usdc.address, deployer, toMwei('1'), false, 2652351324)).to.be.revertedWith('LP Limit Reached');
	
    	await lpusdc.setLiabilityLimit(toMwei('2500000'))
    	await pool.deposit(usdc.address, deployer, toMwei('200000'), false, 2652351324)
    	await expect(pool.deposit(usdc.address, deployer, toMwei('300001'), false, 2652351324)).to.be.revertedWith('LP Limit Reached');

    	await expect(pool.deposit(dai.address, deployer, toWei('2000000'), false, 2652351324)).to.be.revertedWith('LP Limit Reached');
    	await expect(pool.deposit(dai.address, deployer, toWei('1900001'), false, 2652351324)).to.be.revertedWith('LP Limit Reached');
    	await pool.deposit(dai.address, deployer, toWei('1900000'), false, 2652351324)
    	await expect(pool.deposit(dai.address, deployer, toWei('1'), false, 2652351324)).to.be.revertedWith('LP Limit Reached');
	
    	await lpdai.setLiabilityLimit(toWei('2500000'))
    	await pool.deposit(dai.address, deployer, toWei('200000'), false, 2652351324)
    	await expect(pool.deposit(dai.address, deployer, toWei('300001'), false, 2652351324)).to.be.revertedWith('LP Limit Reached');
    	await lpdai.setLiabilityLimit(toWei('1'))
		await pool.withdraw(dai.address, deployer, toWei('100000'), 0, 2652351324)
	});

	it("Test One Tap Limit", async function () {
    	await lpusdc.setLiabilityLimit(toMwei('100000'))
		await pool.swap(usdc.address, usdt.address, deployer, toMwei('40000'), 0, 2652351324);
		await expect(pool.oneTap(usdt.address, usdc.address, deployer, toMwei('10000'), 0, false, false)).to.be.revertedWith('LP Limit Reached')
    	await lpusdc.setLiabilityLimit(toMwei('100010'))
		await pool.oneTap(usdt.address, usdc.address, deployer, toMwei('9'), 0, false, false)
		await expect(pool.oneTap(usdt.address, usdc.address, deployer, toMwei('100'), 0, false, false)).to.be.revertedWith('LP Limit Reached')
    	await lpusdc.setLiabilityLimit(toMwei('1000000'))
    	await lpusdt.setLiabilityLimit(toMwei('10'))
		await pool.oneTap(usdt.address, usdc.address, deployer, toMwei('1000'), 0, false, false)
	});
});
