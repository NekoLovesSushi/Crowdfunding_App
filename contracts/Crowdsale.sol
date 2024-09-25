//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "./Token.sol";

contract Crowdsale {
    address owner;
    Token public token;
    uint256 public price;
    uint256 public maxTokens;
    uint256 public tokensSold;
    uint256 public startTime;
    uint256 public minPurchase = 1 * 1e18;
    uint256 public maxPurchase = 1000 * 1e18;

    mapping(address => bool) public whitelistedAddresses;

    event Buy(uint256 amount, address indexed buyer);
    event Finalize(uint256 tokensSold, uint256 ethRaised);

    constructor(
        Token _token,
        uint256 _price,
        uint256 _maxTokens,
        uint256 _startTime
    ) 
    
    {
        owner = msg.sender;
        token = _token;
        price = _price;
        maxTokens = _maxTokens;
        startTime = _startTime; 
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Caller must be the owner");
        _;
    }

    modifier onlyWhileOpen() {
        require(block.timestamp >= startTime, "Crowdsale has not opened yet");
        _;
    }

    function addToWhitelist(address _user) public onlyOwner {
        whitelistedAddresses[_user] = true;
    }

    modifier onlyWhitelisted() {
        require(whitelistedAddresses[msg.sender], "You are not whitelisted");
        _;
    }
    
    function removeFromWhitelist(address _user) public onlyOwner {
        whitelistedAddresses[_user] = false;
    }

    function setStartTime(uint256 _startTime) public onlyOwner {
    startTime = _startTime;
    }

    receive() external payable onlyWhileOpen {
        uint256 amount = msg.value / price;
        buyTokens(amount * 1e18);
    }

    function buyTokens(uint256 _amount) public payable onlyWhitelisted onlyWhileOpen {
        uint256 requiredEth = (_amount * price) / 1e18;
        console.log("Amount: %s, Required ETH: %s, Sent ETH: %s", _amount, requiredEth, msg.value);
        
        require(_amount >= minPurchase, "Minimum purchase is 1 token");
        require(_amount <= maxPurchase, "Maximum purchase is 1000 tokens");
        
        require(msg.value == requiredEth, "Incorrect ETH value sent");
        
        require(token.balanceOf(address(this)) >= _amount, "Not enough tokens available");
        require(token.transfer(msg.sender, _amount), "Token transfer failed");

        tokensSold += _amount;

        emit Buy(_amount, msg.sender);
    }

    function setPrice(uint256 _price) public onlyOwner {
        price = _price;
    }

    function finalize() public onlyOwner {
        require(token.transfer(owner, token.balanceOf(address(this))));

        uint256 value = address(this).balance;
        (bool sent, ) = owner.call{value: value}("");
        require(sent);

        emit Finalize(tokensSold, value);
    }
}
