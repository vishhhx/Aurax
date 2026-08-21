import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { Asset, PrismaClient } from "../generated/prisma/client";
const connectionString = `${process.env.PG_DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const seed = process.argv[2];

  switch (seed) {
    case "markets":
      await seedMarkets();
      break;
    case "assets":
      await seedAssets();
      break;

    case "all":
      await seedAssets();
      await seedMarkets();
      break;
    default:
      console.log(
        "Please provide a valid seed argument: 'markets' or 'assets'",
      );
      process.exit(1);
  }
}

async function seedMarkets() {
  const assets = await prisma.asset.findMany();

  const assetMap = new Map(
    assets.map((asset: Asset) => [asset.symbol, asset.assetId]),
  );

  console.log(assets);

  const usdc = assetMap.get("USDC");

  if (!usdc) {
    throw new Error("USDC asset not found. Run asset seed first.");
  }

  await prisma.market.createMany({
    skipDuplicates: true,
    data: [
      {
        symbol: "BTCUSDC",
        baseAssetId: assetMap.get("BTC")!,
        quoteAssetId: usdc,

        status: "TRADING",

        tickSize: "0.01",
        stepSize: "0.000001",

        minPrice: "0.01",
        maxPrice: "10000000",

        minQuantity: "0.000001",
        maxQuantity: "1000000",

        minNotional: "10",

        makerFee: "0.001",
        takerFee: "0.001",

        pricePrecision: 2,
        quantityPrecision: 6,

        isEnabled: true,
      },
      {
        symbol: "ETHUSDC",
        baseAssetId: assetMap.get("ETH")!,
        quoteAssetId: usdc,

        status: "TRADING",

        tickSize: "0.01",
        stepSize: "0.000001",

        minPrice: "0.01",
        maxPrice: "10000000",

        minQuantity: "0.000001",
        maxQuantity: "1000000",

        minNotional: "10",

        makerFee: "0.001",
        takerFee: "0.001",

        pricePrecision: 2,
        quantityPrecision: 6,

        isEnabled: true,
      },
      {
        symbol: "SOLUSDC",
        baseAssetId: assetMap.get("SOL")!,
        quoteAssetId: usdc,

        status: "TRADING",

        tickSize: "0.001",
        stepSize: "0.001",

        minPrice: "0.001",
        maxPrice: "100000",

        minQuantity: "0.001",
        maxQuantity: "1000000",

        minNotional: "10",

        makerFee: "0.001",
        takerFee: "0.001",

        pricePrecision: 3,
        quantityPrecision: 3,

        isEnabled: true,
      },
      {
        symbol: "USDTUSDC",
        baseAssetId: assetMap.get("USDT")!,
        quoteAssetId: usdc,

        status: "TRADING",

        tickSize: "0.0001",
        stepSize: "0.000001",

        minPrice: "0.90",
        maxPrice: "1.10",

        minQuantity: "1",

        maxQuantity: "1000000",

        minNotional: "10",

        makerFee: "0.0005",
        takerFee: "0.0005",

        pricePrecision: 4,
        quantityPrecision: 6,

        isEnabled: true,
      },
    ],
  });

  console.log("✅ Markets seeded successfully.");
}

async function seedAssets() {
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
}

main()
  .catch((error) => console.log(error))
  .finally(async () => {
    await prisma.$disconnect();
  });
