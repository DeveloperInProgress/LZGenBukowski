// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import './token/onft/ONFT721.sol';

contract GenBukowski is ONFT721 {

    uint256 public constant MAX_STANDARD_GENBUKOWSKI = 8;
    bool public saleIsActive = false;
    uint256 public standardGenBukowskiCount = 0;
    uint256 public totalSupply = 0;
    uint public whitelistSpaceAvailable = 2;
    
    mapping(address => bool) whitelist;

    constructor(address _lzEndpoint) ONFT721("Gen Bukowski", "GBW", _lzEndpoint) {

    }

    function _baseURI() internal pure override returns (string memory) {
        return "ipfs://QmcU4C8mdCa3vTi5SKgUnSzKBRzFitPyxqtJjqj3rPHDyZ/";
    }

    function withdraw() external onlyOwner {
        uint balance = address(this).balance;
        payable(msg.sender).transfer(balance);
    } 

    function editWhiteList(address[] memory array) external onlyOwner {
        require(array.length <= whitelistSpaceAvailable, 'Whitelist space unavailable');
        for(uint i = 0; i < array.length; i++) {
            address addressElement = array[i];
            if(whitelist[addressElement] == true) {
                continue;
            }
            whitelist[array[i]] = true;
            whitelistSpaceAvailable--;
        }
    }

    function flipSaleIsActive() external onlyOwner {
        saleIsActive = !saleIsActive;
    }

    function reserveMintGenBukowski() external {
        require(whitelist[msg.sender], "sender not whitelisted");
        require(totalSupply < 10, "supply limit exceeded");
        totalSupply++;
        whitelist[msg.sender] = false;
        _safeMint(msg.sender, totalSupply-1);
    }

    function mintGenBukowski() external payable {
        require(standardGenBukowskiCount < MAX_STANDARD_GENBUKOWSKI, "Purchase would exceed max supply of Gen Bukowski");
        uint256 bukowskiPrice = 60000000000000000; //0.06 ETH
        require(bukowskiPrice <= msg.value, "Ether value sent is not correct");

        standardGenBukowskiCount++;
        if(standardGenBukowskiCount == MAX_STANDARD_GENBUKOWSKI) {
            saleIsActive = false;
        }

        totalSupply++;

        _safeMint(msg.sender, totalSupply-1);
    }
} 