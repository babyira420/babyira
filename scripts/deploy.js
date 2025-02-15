const hre = require("hardhat");

     async function main() {
       const BabyIRA = await hre.ethers.getContractFactory("BabyIRA");
       const babyIRA = await BabyIRA.deploy(
         "0x029c58a909fbe3d4be85a24f414dda923a3fde0f",
         "0x4200000000000000000000000000000000000006",
         "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
         "0xLiquidityWallet",
         "0xGiveawayWallet",
         "0xMarketingWallet",
         "0xTreasuryWallet",
         "0xBuybackWallet",
         "0xUniswapRouter"
       );

       await babyIRA.deployed();

       console.log("BabyIRA deployed to:", babyIRA.address);

       // Auto-verify the contract
       await hre.run("verify:verify", {
         address: babyIRA.address,
         constructorArguments: [
           "0xRewardToken1Address",
           "0xRewardToken2Address",
           "0xRewardToken3Address",
           "0xLiquidityWallet",
           "0xGiveawayWallet",
           "0xMarketingWallet",
           "0xTreasuryWallet",
           "0xBuybackWallet",
           "0xUniswapRouter",
         ],
       });
     }

     main().catch((error) => {
       console.error(error);
       process.exitCode = 1;
     });
