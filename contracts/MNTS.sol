// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {OFT} from "@layerzerolabs/solidity-examples/contracts/token/oft/OFT.sol";

contract MNTS is OFT {
    constructor(address _layerZeroEndpoint, address treasury, uint256 initSupply) OFT("Mantis", "MNTS", _layerZeroEndpoint) {
        if (treasury != address(0) && initSupply > 0) {
            _mint(treasury, initSupply);
        }
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}