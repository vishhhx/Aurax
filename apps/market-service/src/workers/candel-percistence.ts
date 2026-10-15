import { prisma } from "@repo/pg";
import { candleAggregator } from "../producers/candel";

let timer: ReturnType<typeof setInterval> | undefined;
let isRunning = false;

async function persistDirtyCandles(): Promise<void> {
  if (isRunning) return;

  isRunning = true;

  try {
    const batch = candleAggregator.getDirtyCandles();

    if (batch.length === 0) return;

    await prisma.$transaction(
      batch.map(({ candle }) =>
        prisma.candle.upsert({
          where: {
            symbol_interval_openTime: {
              symbol: candle.symbol,
              interval: candle.interval,
              openTime: BigInt(candle.openTime),
            },
          },

          create: {
            symbol: candle.symbol,
            interval: candle.interval,
            openTime: BigInt(candle.openTime),
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            baseVolume: candle.baseVolume,
            quoteVolume: candle.quoteVolume,
          },

          update: {
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            baseVolume: candle.baseVolume,
            quoteVolume: candle.quoteVolume,
          },
        }),
      ),
    );

    candleAggregator.acknowledgePersisted(
      batch.map(({ key, revision }) => ({
        key,
        revision,
      })),
    );

    console.log(`[CandlePersistence] Saved ${batch.length} candles`);
  } catch (error) {
    console.error("[CandlePersistence] Batch failed:", error);
  } finally {
    isRunning = false;
  }
}

export function startCandlePersistenceWorker(): void {
  if (timer) return;

  console.log("[CandlePersistence] Starting 5-second worker");

  void persistDirtyCandles();

  timer = setInterval(() => {
    void persistDirtyCandles();
  }, 5_000);
}

export async function stopCandlePersistenceWorker(): Promise<void> {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }

  while (isRunning) {
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }

  await persistDirtyCandles();
}
