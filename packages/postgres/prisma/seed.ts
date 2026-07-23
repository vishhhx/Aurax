import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
const connectionString = `${process.env.PG_DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.asset.createMany({
    skipDuplicates: true,
    data: [
      {
        symbol: "BTC",
        name: "Bitcoin",
        imageUrl: "/assets/btc.png",
        decimals: 8,
        minDeposit: "0.0001",
        minWithdrawal: "0.0005",
      },
      {
        symbol: "ETH",
        name: "Ethereum",
        imageUrl: "/assets/eth.png",
        decimals: 18,
        minDeposit: "0.001",
        minWithdrawal: "0.005",
      },
      {
        symbol: "SOL",
        name: "Solana",
        imageUrl: "/assets/sol.png",
        decimals: 9,
        minDeposit: "0.01",
        minWithdrawal: "0.05",
      },
      {
        symbol: "USDT",
        name: "Tether USD",
        imageUrl: "/assets/usdt.png",
        decimals: 6,
        minDeposit: "1",
        minWithdrawal: "5",
      },
      {
        symbol: "USDC",
        name: "USD Coin",
        imageUrl: "/assets/usdc.png",
        decimals: 6,
        minDeposit: "1",
        minWithdrawal: "5",
      },
    ],
  });

  console.log("Assets seeded.");
}

main()
  .catch((error) => console.log(error))
  .finally(async () => {
    await prisma.$disconnect();
  });
