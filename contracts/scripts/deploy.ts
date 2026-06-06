import { ethers } from "hardhat";

async function main() {
  const Factory = await ethers.getContractFactory("SilentPayInvoices");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  console.log("SilentPayInvoices deployed to:", await contract.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
