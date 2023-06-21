//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {OwnableUpgradeable as Ownable} from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import {ERC20Upgradeable as ERC20} from '@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';

contract DummyVeMnt is Initializable, ERC20, Ownable {

    function initialize() public initializer {
        __ERC20_init('Dummy veMNT', 'dveMNT');
        __Ownable_init();
    }
}
