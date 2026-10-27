/**
 * Minimal in-process metrics exposed in Prometheus text format at `/metrics`.
 * Label cardinality is bounded by construction: labels are only ever topic
 * names, configured market symbols and fixed reason strings.
 */

type Labels = Record<string, string>;

const counters = new Map<string, Map<string, number>>();
const gauges = new Map<string, Map<string, number>>();
const summaries = new Map<string, Map<string, { count: number; sum: number; max: number }>>();
const help = new Map<string, string>();

function labelKey(labels: Labels = {}): string {
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}="${String(labels[k]).replace(/["\\\n]/g, "_")}"`)
    .join(",");
}

function series<T>(store: Map<string, Map<string, T>>, name: string): Map<string, T> {
  let s = store.get(name);
  if (!s) {
    s = new Map();
    store.set(name, s);
  }
  return s;
}

export const metrics = {
  describe(name: string, text: string): void {
    help.set(name, text);
  },

  inc(name: string, labels?: Labels, by = 1): void {
    const s = series(counters, name);
    const key = labelKey(labels);
    s.set(key, (s.get(key) ?? 0) + by);
  },

  set(name: string, value: number, labels?: Labels): void {
    series(gauges, name).set(labelKey(labels), value);
  },

  observe(name: string, value: number, labels?: Labels): void {
    const s = series(summaries, name);
    const key = labelKey(labels);
    const current = s.get(key) ?? { count: 0, sum: 0, max: 0 };
    current.count += 1;
    current.sum += value;
    current.max = Math.max(current.max, value);
    s.set(key, current);
  },

  get(name: string, labels?: Labels): number | undefined {
    const key = labelKey(labels);
    return counters.get(name)?.get(key) ?? gauges.get(name)?.get(key);
  },

  render(): string {
    const lines: string[] = [];
    const emit = (name: string, type: string, rows: Array<[string, string, number]>) => {
      if (help.has(name)) lines.push(`# HELP ${name} ${help.get(name)}`);
      lines.push(`# TYPE ${name} ${type}`);
      for (const [suffix, labels, value] of rows) {
        lines.push(`${name}${suffix}${labels ? `{${labels}}` : ""} ${value}`);
      }
    };

    for (const [name, s] of counters) {
      emit(name, "counter", [...s].map(([l, v]) => ["", l, v]));
    }
    for (const [name, s] of gauges) {
      emit(name, "gauge", [...s].map(([l, v]) => ["", l, v]));
    }
    for (const [name, s] of summaries) {
      const rows: Array<[string, string, number]> = [];
      for (const [l, v] of s) {
        rows.push(["_count", l, v.count], ["_sum", l, v.sum], ["_max", l, v.max]);
      }
      emit(name, "summary", rows);
    }

    return `${lines.join("\n")}\n`;
  },

  reset(): void {
    counters.clear();
    gauges.clear();
    summaries.clear();
  },
};

metrics.describe("market_kafka_messages_total", "Kafka messages handled, by topic and outcome");
metrics.describe("market_kafka_invalid_messages_total", "Malformed Kafka messages skipped, by topic and reason");
metrics.describe("market_kafka_processing_ms", "Kafka message processing latency in milliseconds");
metrics.describe("market_kafka_consumer_lag", "Offset lag reported by the consumer after each batch");
metrics.describe("market_trades_total", "Trades by outcome (applied, duplicate, unknown_market, late)");
metrics.describe("market_orderbook_updates_total", "Order-book snapshots by outcome");
metrics.describe("market_orderbook_sequence_gaps_total", "Skipped order-book sequence numbers observed");
metrics.describe("market_publish_failures_total", "Failed derived-event publications");
metrics.describe("market_candles_dirty", "Candle revisions waiting to be persisted");
metrics.describe("market_candle_persist_failures_total", "Failed candle persistence batches");
