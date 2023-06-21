// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IAPI3Proxy.sol";


contract API3FeedReader is Ownable {
    // This contract reads from a single proxy. Your contract can read from
    // multiple proxies.
    address public proxy;

    constructor(address _proxy) {
        setProxy(_proxy);
    }

    // Updating the proxy address is a security-critical action. In this
    // example, only the owner is allowed to do so.
    // You may want to update your proxy to switch to another data feed, enable
    // OEV support, or even switch to another oracle solution. Implementing a
    // method to update proxies is highly recommended.
    function setProxy(address _proxy) public onlyOwner {
        proxy = _proxy;
    }

    function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) {
        (int224 value, uint256 timestamp) = IAPI3Proxy(proxy).read();
        // If you have any assumptions about `value` and `timestamp`, make sure
        // to validate them right after reading from the proxy. For example,
        // if the value you are reading is the spot price of an asset, you may
        // want to reject non-positive values...
        require(value >= 0, "Value not positive");
        // ...and if the data feed is being updated with a one day-heartbeat
        // interval, you may want to check for that.
        require(timestamp + 2 days > block.timestamp, "Timestamp older than two days");

        updatedAt = timestamp;
        answer = int256(value);
    }

    function decimals() external view returns (uint8) {
        return 18;
    }
}