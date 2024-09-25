const { expect } = require('chai');
const { ethers } = require('hardhat');

const tokens = (n) => {
  return ethers.utils.parseUnits(n.toString(), 'ether')
  }
const ether = tokens

describe('Crowdsale', () => {
  // eslint-disable-next-line no-unused-vars
  let token, crowdsale, currentTime, startTime, deployer, user1, user2, accounts, transaction, whitelist, result, amount, price, value, goal, endTime

  beforeEach(async () => {
    const Crowdsale = await ethers.getContractFactory('Crowdsale')
    const Token = await ethers.getContractFactory('Token')
    const currentTime = (await ethers.provider.getBlock('latest')).timestamp
    
    startTime = currentTime - 60
    endTime = currentTime + 3600
    token = await Token.deploy('Dapp University', 'DAPP', '1000000')
    goal = ether(10) // Set the goal to 10 ETH

    accounts = await ethers.getSigners()
    deployer = accounts[0]
    user1 = accounts[1]
    user2 = accounts[2]

    crowdsale = await Crowdsale.deploy(token.address, ether(1), '1000000', startTime, goal, endTime)

    transaction = await token.connect(deployer).transfer(crowdsale.address, tokens(1000000))
    await transaction.wait()

    whitelist = await crowdsale.connect(deployer).addToWhitelist(user1.address)
    result = await whitelist.wait()
  })

  describe('Whitelist Functionality', () => {
    
    it('Should add user1 to the whitelist', async () => {
      whitelist = await crowdsale.connect(deployer).addToWhitelist(user1.address)
      result = await whitelist.wait()

      const isWhitelisted = await crowdsale.whitelistedAddresses(user1.address)
      expect(isWhitelisted).to.equal(true)
      })

    it('Should allow whitelisted users to buy tokens', async () => {
      await crowdsale.connect(deployer).addToWhitelist(user1.address)

      whitelist = await crowdsale.connect(user1).buyTokens(tokens(10), { value: ether(10) })
      result = await whitelist.wait()

      expect(await token.balanceOf(user1.address)).to.equal(tokens(10))
      })

    it('Should reject non-whitelisted users from buying tokens', async () => {
      await expect(crowdsale.connect(user2).buyTokens(tokens(10), { value: ether(10) })).to.be.revertedWith('You are not whitelisted')
      })

    it('Should remove a user from the whitelist', async () => {
      await crowdsale.connect(deployer).addToWhitelist(user2.address)
      await crowdsale.connect(deployer).removeFromWhitelist(user2.address)
   
      await expect(crowdsale.connect(user2).buyTokens(tokens(10), { value: ether(10) })).to.be.revertedWith('You are not whitelisted')
      })  

  })

  describe('Deployment', () => {

    it('Sends tokens to the Crowdsale contract', async () => {
      expect(await token.balanceOf(crowdsale.address)).to.equal(tokens(1000000))
    })

    it('Returns the price', async () => {
      expect(await crowdsale.price()).to.equal(ether(1))
    })

    it('Returns token address', async () => {
      expect(await crowdsale.token()).to.equal(token.address)
    })

    it('Sets the start time correctly', async () => {
      expect(await crowdsale.startTime()).to.equal(startTime)
    })
    
  })

  describe('Buying Tokens', () => {
    amount = tokens(10)

    describe('Success', () => {

      beforeEach(async () => {
        transaction = await crowdsale.connect(user1).buyTokens(amount, { value: ether(10) })
        result = await transaction.wait()
      })

      it('Transfers tokens', async () => {
        expect(await token.balanceOf(crowdsale.address)).to.equal(tokens(999990))
        expect(await token.balanceOf(user1.address)).to.equal(amount)
      })

      it('Updates tokensSold', async () => {
        expect(await crowdsale.tokensSold()).to.equal(amount)
      })

      it('Emits a buy event', async () => {
        // --> https://hardhat.org/hardhat-chai-matchers/docs/reference#.emit
        await expect(transaction).to.emit(crowdsale, 'Buy')
          .withArgs(amount, user1.address)
      })

    })

    describe('Failure', () => {

      it('Rejects insufficent ETH', async () => {
        await expect(crowdsale.connect(user1).buyTokens(tokens(10), { value: 0 })).to.be.reverted
      })

    })
    describe('Before start time', () => {
  
      it('Should reject token purchases before the crowdsale opens', async () => {
        await crowdsale.setStartTime((await ethers.provider.getBlock('latest')).timestamp + 60)
        await expect(crowdsale.connect(user1).buyTokens(amount, { value: ether(10) })
        ).to.be.revertedWith('Crowdsale has not opened yet')
      })

    })

    describe('After start time', () => {

      it('Should allow token purchases after the crowdsale opens', async () => {
        transaction = await crowdsale.connect(user1).buyTokens(amount, { value: ether(10) })
        result = await transaction.wait()

        expect(await token.balanceOf(user1.address)).to.equal(amount);
      }) 

    })
  })

  describe('Refund Functionality', () => {

    it('Should allow refunds if the goal is not reached after the end', async () => {
      await crowdsale.connect(user1).buyTokens(tokens(5), { value: ether(5) })

      await ethers.provider.send("evm_increaseTime", [3601])
      await ethers.provider.send("evm_mine")

      const beforeBalance = await ethers.provider.getBalance(user1.address)
      transaction = await crowdsale.connect(user1).claimRefund()
      result = await transaction.wait()

      const afterBalance = await ethers.provider.getBalance(user1.address)
      expect(afterBalance).to.be.gt(beforeBalance)
    })

    it('Should not allow refunds if the goal is met', async () => {
      await crowdsale.connect(user1).buyTokens(tokens(10), { value: ether(10) })

      await ethers.provider.send("evm_increaseTime", [3601])
      await ethers.provider.send("evm_mine")

      await expect(crowdsale.connect(user1).claimRefund()).to.be.revertedWith('Goal reached, refunds not available')
    })

    it('Should prevent refunds before the crowdsale ends', async () => {
      await crowdsale.connect(user1).buyTokens(tokens(5), { value: ether(5) })
      await expect(crowdsale.connect(user1).claimRefund()).to.be.revertedWith('Crowdsale is still ongoing')
    })
  })

  describe('Finalizing Crowdsale', () => {

    it('Should finalize the crowdsale and prevent further refunds if the goal is met', async () => {
      await crowdsale.connect(user1).buyTokens(tokens(10), { value: ether(10) })
      await ethers.provider.send("evm_increaseTime", [3601])
      await ethers.provider.send("evm_mine")

      transaction = await crowdsale.connect(deployer).finalizeCrowdsale()
      result = await transaction.wait()

      await expect(crowdsale.connect(user1).claimRefund()).to.be.revertedWith('Goal reached, refunds not available')
    })

  })

  describe('Sending ETH', () => {
    amount = ether(10)

    describe('Success', () => {

      beforeEach(async () => {
        transaction = await user1.sendTransaction({ to: crowdsale.address, value: amount })
        result = await transaction.wait()
      })

      it('Updates contracts ether balance', async () => {
        expect(await ethers.provider.getBalance(crowdsale.address)).to.equal(amount)
      })

      it('Updates user token balance', async () => {
        expect(await token.balanceOf(user1.address)).to.equal(amount)
      })

    })

  })

  describe('Updating Price', () => {
    price = ether(2)

    describe('Success', () => {

      beforeEach(async () => {
        transaction = await crowdsale.connect(deployer).setPrice(ether(2))
        result = await transaction.wait()
      })

      it('Updates the price', async () => {
        expect(await crowdsale.price()).to.equal(ether(2))
      })

    })

    describe('Failure', () => {

      it('Prevents non-owner from updating price', async () => {
        await expect(crowdsale.connect(user1).setPrice(price)).to.be.reverted
      })

    })

  })

  describe('Finalizing Sale', () => {
    amount = tokens(10)
    value = ether(10)

    describe('Success', () => {

      beforeEach(async () => {
        transaction = await crowdsale.connect(user1).buyTokens(amount, { value: value })
        result = await transaction.wait()

        transaction = await crowdsale.connect(deployer).finalize()
        result = await transaction.wait()
      })

      it('Transfers remaining tokens to owner', async () => {
        expect(await token.balanceOf(crowdsale.address)).to.equal(0)
        expect(await token.balanceOf(deployer.address)).to.equal(tokens(999990))
      })

      it('Transfers ETH balance to owner', async () => {
        expect(await ethers.provider.getBalance(crowdsale.address)).to.equal(0)
      })

      it('Emits Finalize event', async () => {
        await expect(transaction).to.emit(crowdsale, "Finalize")
        .withArgs(amount, value)
      })

    })

    describe('Failure', () => {

      it('Prevents non-owner from finalizing', async () => {
        await expect(crowdsale.connect(user1).finalize()).to.be.reverted
      })

    })

  })

  describe('Minimum and Maximum Contribution', () => {

    it('Should reject contributions below the minimum purchase amount', async () => {
      amount = tokens(0.5)
      await expect(
      crowdsale.connect(user1).buyTokens(amount, { value: ether(0.5) }) 
      ).to.be.revertedWith('Minimum purchase is 1 token')
    })

    it('Should reject contributions above the maximum purchase amount', async () => {
      amount = tokens(1001)
      await expect(
      crowdsale.connect(user1).buyTokens(amount, { value: ether(1001) })
      ).to.be.revertedWith('Maximum purchase is 1000 tokens')
    })

    it('Should allow contributions within the valid range', async () => {
      amount = tokens(500)
      transaction = await crowdsale.connect(user1).buyTokens(amount, { value: ether(500) })
      result = await transaction.wait()

      expect(await token.balanceOf(user1.address)).to.equal(amount)
      await expect(transaction).to.emit(crowdsale, 'Buy').withArgs(amount, user1.address)
    })
  })

})
