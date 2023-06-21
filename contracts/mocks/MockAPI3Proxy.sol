// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockAPI3Proxy {

    int224 valueUSD;    // in 18 decimals

    constructor (int224 _valueUSD) {
        valueUSD = _valueUSD;
    }
  
    function read() external view returns (int224 value, uint256 timestamp) {
        value = valueUSD;
        timestamp = block.timestamp;
    }
}