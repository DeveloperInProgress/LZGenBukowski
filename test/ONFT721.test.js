const { expect } = require("chai")
const { ethers } = require("hardhat")

describe("ONFT721: ", function () {
    const chainId_A = 1
    const chainId_B = 2

    let owner, warlock, lockwar, lzEndpointMockA, lzEndpointMockB, LZEndpointMock, ONFT, ONFT_A, ONFT_B

    before(async function () {
        owner = (await ethers.getSigners())[0]
        warlock = (await ethers.getSigners())[1]
        lockwar = (await ethers.getSigners())[2]
        LZEndpointMock = await ethers.getContractFactory("LZEndpointMock")
        ONFT = await ethers.getContractFactory("GenBukowski")
    })

    beforeEach(async function () {
        lzEndpointMockA = await LZEndpointMock.deploy(chainId_A)
        lzEndpointMockB = await LZEndpointMock.deploy(chainId_B)

        // generate a proxy to allow it to go ONFT
        ONFT_A = await ONFT.deploy(lzEndpointMockA.address)
        
        const activateSaleTxA = await ONFT_A.flipSaleIsActive();
        activateSaleTxA.wait() 

        ONFT_B = await ONFT.deploy(lzEndpointMockB.address)

        const activateSaleTxB = await ONFT_B.flipSaleIsActive();
        activateSaleTxB.wait() 

        // wire the lz endpoints to guide msgs back and forth
        lzEndpointMockA.setDestLzEndpoint(ONFT_B.address, lzEndpointMockB.address)
        lzEndpointMockB.setDestLzEndpoint(ONFT_A.address, lzEndpointMockA.address)

        // set each contracts source address so it can send to each other
        await ONFT_A.setTrustedRemote(chainId_B, ethers.utils.solidityPack(["address", "address"], [ONFT_B.address, ONFT_A.address]))
        await ONFT_B.setTrustedRemote(chainId_A, ethers.utils.solidityPack(["address", "address"], [ONFT_A.address, ONFT_B.address]))
    })

    describe("edit whitelist", async function () {
        it("owner can edit whitelist - 2 address", async function () {
            const editWLTx = await ONFT_A.editWhiteList([
                warlock.address,
                lockwar.address
            ]);
            editWLTx.wait();

            expect(await ONFT_A.isWhitelisted(warlock.address)).to.be.true;
            expect(await ONFT_A.isWhitelisted(lockwar.address)).to.be.true;
        });

        it("owner cannot edit whitelist - more than 2 address", async function () {
            const editWLTx = ONFT_A.editWhiteList([
                owner.address,
                warlock.address,
                lockwar.address
            ]);
            
            await expect(editWLTx).to.be.revertedWith('Whitelist space unavailable');
        });

        it("non owner cannot edit whitelist", async function() {
            const editWLTx = ONFT_A.connect(warlock).editWhiteList([
                warlock.address,
                lockwar.address
            ]);
            
            await expect(editWLTx).to.be.revertedWith('Ownable: caller is not the owner');
        });

        it("cannot duplicate whitelist additions", async function() {
            const editWLTx = await ONFT_A.editWhiteList([
                warlock.address,
            ]); 
            editWLTx.wait();

            const editWLTx2 = await ONFT_A.editWhiteList([
                warlock.address,
            ]); 
            editWLTx2.wait();

            expect(await ONFT_A.whitelistSpaceAvailable()).equals(1);
        })
    });

    describe("flipSaleIsActive()", async function () {
        it("owner can flip saleIsActive", async function () {
            const flipTx = await ONFT_A.flipSaleIsActive();
            flipTx.wait();
        
            expect(await ONFT_A.saleIsActive()).to.be.false;
        });

        it("non owner cannot flip saleIsActive", async function () {
            const flipTx = ONFT_A.connect(warlock).flipSaleIsActive();
        
            await expect(flipTx).to.be.revertedWith('Ownable: caller is not the owner')
        });
    })

    describe("reserveMintGenBukowski()", async function () {
        it('whitelisted can reserve mint', async function () {
            const editWLTx = await ONFT_A.editWhiteList([
                warlock.address,
            ]);
            editWLTx.wait();
            
            const mintTx = await ONFT_A.connect(warlock).reserveMintGenBukowski();
            mintTx.wait();

            expect(await ONFT_A.ownerOf(0)).equals(warlock.address);
        });

        it('non whitelisted cannot reserve mint', async function() {
            const mintTx = ONFT_A.connect(warlock).reserveMintGenBukowski();
            await expect(mintTx).to.be.revertedWith("sender not whitelisted");
        });

        it('whitelisted cannot mint twice', async function () {
            const editWLTx = await ONFT_A.editWhiteList([
                warlock.address,
            ]);
            editWLTx.wait();
            
            const mintTx = await ONFT_A.connect(warlock).reserveMintGenBukowski();
            mintTx.wait();

            const mintTx2 = ONFT_A.connect(warlock).reserveMintGenBukowski();

            await expect(mintTx2).to.be.revertedWith("sender not whitelisted");
        });
    });

    describe("mintGenBukowski()", async function () {
        it('can mint gen bukowski with value >= 0.06 ETH', async function() {
              const mintTx = await ONFT_A.mintGenBukowski({value: ethers.utils.parseEther("0.06")});
              mintTx.wait();

              expect(await ONFT_A.ownerOf(0)).equals(owner.address);
        });

        it('cannot mint gen bukowski with value < 0.06 ETH', async function() {
            const mintTx = ONFT_A.mintGenBukowski({value: ethers.utils.parseEther("0.05")});
            await expect(mintTx).to.be.revertedWith("Ether value sent is not correct");
        });

        it('cannot mint more than MAX_STANDARD_GENBUKOWSKI tokens', async function() {
            const max = await ONFT_A.MAX_STANDARD_GENBUKOWSKI();
            for(let i = 0; i < max; i++) {
                const mintTx = await ONFT_A.mintGenBukowski({value: ethers.utils.parseEther("0.06")});
                mintTx.wait();
            }
            const mintTx = ONFT_A.mintGenBukowski({value: ethers.utils.parseEther("0.06")});

            await expect(mintTx).to.be.revertedWith("Purchase would exceed max supply of Gen Bukowski");
        });
    })

    it("sendFrom() - your own tokens", async function () {
        const tokenId = 0
        await ONFT_A.mintGenBukowski({value: ethers.utils.parseEther('0.06', 'wei')})

        // verify the owner of the token is on the source chain
        expect(await ONFT_A.ownerOf(tokenId)).to.be.equal(owner.address)

        // token doesn't exist on other chain
        await expect(ONFT_B.ownerOf(tokenId)).to.be.revertedWith("ERC721: invalid token ID")

        // can transfer token on srcChain as regular erC721
        await ONFT_A.transferFrom(owner.address, warlock.address, tokenId)
        expect(await ONFT_A.ownerOf(tokenId)).to.be.equal(warlock.address)

        // approve the proxy to swap your token
        await ONFT_A.connect(warlock).approve(ONFT_A.address, tokenId)

        // estimate nativeFees
        let nativeFee = (await ONFT_A.estimateSendFee(chainId_B, warlock.address, tokenId, false, "0x")).nativeFee

        // swaps token to other chain
        await ONFT_A.connect(warlock).sendFrom(
            warlock.address,
            chainId_B,
            warlock.address,
            tokenId,
            warlock.address,
            ethers.constants.AddressZero,
            "0x",
            { value: nativeFee }
        )

        // token is burnt
        expect(await ONFT_A.ownerOf(tokenId)).to.be.equal(ONFT_A.address)

        // token received on the dst chain
        expect(await ONFT_B.ownerOf(tokenId)).to.be.equal(warlock.address)

        // estimate nativeFees
        nativeFee = (await ONFT_B.estimateSendFee(chainId_A, warlock.address, tokenId, false, "0x")).nativeFee

        // can send to other onft contract eg. not the original nft contract chain
        await ONFT_B.connect(warlock).sendFrom(
            warlock.address,
            chainId_A,
            warlock.address,
            tokenId,
            warlock.address,
            ethers.constants.AddressZero,
            "0x",
            { value: nativeFee }
        )

        // token is burned on the sending chain
        expect(await ONFT_B.ownerOf(tokenId)).to.be.equal(ONFT_B.address)
    })

    it("sendFrom() - reverts if not owner on non proxy chain", async function () {
        const tokenId = 0
        await ONFT_A.mintGenBukowski({value: ethers.utils.parseEther('0.06', 'wei')})

        // approve the proxy to swap your token
        await ONFT_A.approve(ONFT_A.address, tokenId)

        // estimate nativeFees
        let nativeFee = (await ONFT_A.estimateSendFee(chainId_B, owner.address, tokenId, false, "0x")).nativeFee

        // swaps token to other chain
        await ONFT_A.sendFrom(owner.address, chainId_B, owner.address, tokenId, owner.address, ethers.constants.AddressZero, "0x", {
            value: nativeFee,
        })

        // token received on the dst chain
        expect(await ONFT_B.ownerOf(tokenId)).to.be.equal(owner.address)

        // reverts because other address does not own it
        await expect(
            ONFT_B.connect(warlock).sendFrom(
                warlock.address,
                chainId_A,
                warlock.address,
                tokenId,
                warlock.address,
                ethers.constants.AddressZero,
                "0x"
            )
        ).to.be.revertedWith("ONFT721: send caller is not owner nor approved")
    })

    it("sendFrom() - on behalf of other user", async function () {
        const tokenId = 0
        await ONFT_A.mintGenBukowski({value: ethers.utils.parseEther('0.06', 'wei')})

        // approve the proxy to swap your token
        await ONFT_A.approve(ONFT_A.address, tokenId)

        // estimate nativeFees
        let nativeFee = (await ONFT_A.estimateSendFee(chainId_B, owner.address, tokenId, false, "0x")).nativeFee

        // swaps token to other chain
        await ONFT_A.sendFrom(owner.address, chainId_B, owner.address, tokenId, owner.address, ethers.constants.AddressZero, "0x", {
            value: nativeFee,
        })

        // token received on the dst chain
        expect(await ONFT_B.ownerOf(tokenId)).to.be.equal(owner.address)

        // approve the other user to send the token
        await ONFT_B.approve(warlock.address, tokenId)

        // estimate nativeFees
        nativeFee = (await ONFT_B.estimateSendFee(chainId_A, warlock.address, tokenId, false, "0x")).nativeFee

        // sends across
        await ONFT_B.connect(warlock).sendFrom(
            owner.address,
            chainId_A,
            warlock.address,
            tokenId,
            warlock.address,
            ethers.constants.AddressZero,
            "0x",
            { value: nativeFee }
        )

        // token received on the dst chain
        expect(await ONFT_A.ownerOf(tokenId)).to.be.equal(warlock.address)
    })

    it("sendFrom() - reverts if contract is approved, but not the sending user", async function () {
        const tokenId = 0
        await ONFT_A.mintGenBukowski({value: ethers.utils.parseEther('0.06', 'wei')})

        // approve the proxy to swap your token
        await ONFT_A.approve(ONFT_A.address, tokenId)

        // estimate nativeFees
        let nativeFee = (await ONFT_A.estimateSendFee(chainId_B, owner.address, tokenId, false, "0x")).nativeFee

        // swaps token to other chain
        await ONFT_A.sendFrom(owner.address, chainId_B, owner.address, tokenId, owner.address, ethers.constants.AddressZero, "0x", {
            value: nativeFee,
        })

        // token received on the dst chain
        expect(await ONFT_B.ownerOf(tokenId)).to.be.equal(owner.address)

        // approve the contract to swap your token
        await ONFT_B.approve(ONFT_B.address, tokenId)

        // reverts because contract is approved, not the user
        await expect(
            ONFT_B.connect(warlock).sendFrom(
                owner.address,
                chainId_A,
                warlock.address,
                tokenId,
                warlock.address,
                ethers.constants.AddressZero,
                "0x"
            )
        ).to.be.revertedWith("ONFT721: send caller is not owner nor approved")
    })

    it("sendFrom() - reverts if not approved on non proxy chain", async function () {
        const tokenId = 0
        await ONFT_A.mintGenBukowski({value: ethers.utils.parseEther('0.06', 'wei')})

        // approve the proxy to swap your token
        await ONFT_A.approve(ONFT_A.address, tokenId)

        // estimate nativeFees
        let nativeFee = (await ONFT_A.estimateSendFee(chainId_B, owner.address, tokenId, false, "0x")).nativeFee

        // swaps token to other chain
        await ONFT_A.sendFrom(owner.address, chainId_B, owner.address, tokenId, owner.address, ethers.constants.AddressZero, "0x", {
            value: nativeFee,
        })

        // token received on the dst chain
        expect(await ONFT_B.ownerOf(tokenId)).to.be.equal(owner.address)

        // reverts because user is not approved
        await expect(
            ONFT_B.connect(warlock).sendFrom(
                owner.address,
                chainId_A,
                warlock.address,
                tokenId,
                warlock.address,
                ethers.constants.AddressZero,
                "0x"
            )
        ).to.be.revertedWith("ONFT721: send caller is not owner nor approved")
    })

    it("sendFrom() - reverts if sender does not own token", async function () {
        const tokenIdA = 0
        const tokenIdB = 1
        // mint to both owners
        await ONFT_A.mintGenBukowski({value: ethers.utils.parseEther('0.06', 'wei')})
        await ONFT_A.connect(warlock).mintGenBukowski({value: ethers.utils.parseEther('0.06', 'wei')})

        // approve owner.address to transfer, but not the other
        await ONFT_A.setApprovalForAll(ONFT_A.address, true)

        await expect(
            ONFT_A.connect(warlock).sendFrom(
                warlock.address,
                chainId_B,
                warlock.address,
                tokenIdA,
                warlock.address,
                ethers.constants.AddressZero,
                "0x"
            )
        ).to.be.revertedWith("ONFT721: send caller is not owner nor approved")
        await expect(
            ONFT_A.connect(warlock).sendFrom(
                warlock.address,
                chainId_B,
                owner.address,
                tokenIdA,
                owner.address,
                ethers.constants.AddressZero,
                "0x"
            )
        ).to.be.revertedWith("ONFT721: send caller is not owner nor approved")
    })
})
