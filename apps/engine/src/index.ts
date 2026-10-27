import { spawn } from "node:child_process";
import { ENV } from "./config/env";
import { StartEngine } from "./main";

/**
 * One process per market shard (MARKETS_A, MARKETS_B). Each shard owns its
 * books, its Kafka consumer group and its own gRPC port, so shards are
 * independent child processes rather than node:cluster workers (cluster
 * routes listening sockets through the primary, which fails for per-worker
 * gRPC ports under Bun).
 */
const workerIndex = process.env.ENGINE_WORKER_INDEX;

if (workerIndex === undefined) {
  const shards = [ENV.MARKETS_A, ENV.MARKETS_B].filter((m) => m.length > 0);
  if (shards.length === 0) {
    throw new Error("Configure at least one market shard (MARKETS_A / MARKETS_B)");
  }

  const children = new Set<ReturnType<typeof spawn>>();
  let stopping = false;

  shards.forEach((markets, index) => {
    const start = () => {
      const child = spawn(process.execPath, [process.argv[1]!], {
        env: { ...process.env, MARKETS: markets.join(","), ENGINE_WORKER_INDEX: String(index) },
        stdio: "inherit",
      });
      children.add(child);
      child.on("exit", (code, signal) => {
        children.delete(child);
        if (stopping) return;
        console.error(`[Engine] shard ${index} (${markets.join(",")}) exited (${code ?? signal}); restarting in 2s`);
        setTimeout(start, 2_000);
      });
    };
    start();
  });

  const shutdown = (signal: NodeJS.Signals) => {
    stopping = true;
    for (const child of children) child.kill(signal);
    setTimeout(() => process.exit(0), 5_000).unref();
    if (children.size === 0) process.exit(0);
    for (const child of children) child.on("exit", () => children.size === 0 && process.exit(0));
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
} else {
  const marketSymbols = (process.env.MARKETS ?? "")
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean);

  if (marketSymbols.length === 0) {
    throw new Error("MARKETS environment variable is not defined");
  }

  console.log(`Engine shard ${workerIndex} (pid ${process.pid}) for markets: ${marketSymbols.join(", ")}`);

  StartEngine(marketSymbols, Number(workerIndex)).catch((error) => {
    console.error("[Engine] shard failed to start", error);
    process.exit(1);
  });
}
