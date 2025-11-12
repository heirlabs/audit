const hre = require("hardhat");

async function main() {
    const [signer] = await ethers.getSigners();
    const token = await ethers.getContractAt("MockHeirToken", "0x49E1d9DcD905fFd1A53F003BD93d83d8fFeA6e42");
    const target = "0x48b2680068f311e7d777dc9502957325dae1df99";
    
    const deployerBal = await token.balanceOf(signer.address);
    const targetBal = await token.balanceOf(target);
    const totalSupply = await token.totalSupply();
    
    console.log("Total Supply:", ethers.utils.formatUnits(totalSupply, 6), "HEIR");
    console.log("Deployer balance:", ethers.utils.formatUnits(deployerBal, 6), "HEIR");
    console.log("Target balance:", ethers.utils.formatUnits(targetBal, 6), "HEIR");
    
    // Try to send again if target balance is 0
    if (targetBal.eq(0) && deployerBal.gt(0)) {
        console.log("\n⚠️  Target balance is 0, attempting transfer again...");
        const halfSupply = totalSupply.div(2);
        
        try {
            const tx = await token.transfer(target, halfSupply);
            console.log("Transfer tx:", tx.hash);
            await tx.wait();
            
            const newTargetBal = await token.balanceOf(target);
            const newDeployerBal = await token.balanceOf(signer.address);
            
            console.log("\n✅ Transfer completed!");
            console.log("New deployer balance:", ethers.utils.formatUnits(newDeployerBal, 6), "HEIR");
            console.log("New target balance:", ethers.utils.formatUnits(newTargetBal, 6), "HEIR");
        } catch (error) {
            console.error("Transfer failed:", error.message);
        }
    }
}

main().catch(console.error);