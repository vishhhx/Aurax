import cluster from "node:cluster";
import { ENV } from "./config/env";
import { StartEngine } from "./main";

if (cluster.isPrimary) {
  const numWorkers = 2;

  for (let i = 0; i < numWorkers; i++) {
    cluster.fork({
      MARKETS: i === 0 ? ENV.MARKETS_A : ENV.MARKETS_B,
    });
  }
} else {
  const markets = process.env.MARKETS;
  if (!markets) {
    throw new Error("MARKETS environment variable is not defined");
  }

  const marketSymbols = markets
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean);

  console.log(
    `Worker ${process.pid} started for markets: ${marketSymbols.join(", ")}`,
  );

  StartEngine(marketSymbols);
}
