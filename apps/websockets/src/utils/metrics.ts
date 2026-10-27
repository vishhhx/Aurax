/** Minimal in-process counters/gauges, exposed as Prometheus text at GET /metrics. */
type Labels = Record<string, string>;

const counters = new Map<string, Map<string, number>>();
const gauges = new Map<string, Map<string, number>>();

const key = (labels: Labels = {}) =>
  Object.keys(labels)
    .sort()
    .map((k) => `${k}="${String(labels[k]).replace(/["\\\n]/g, "_")}"`)
    .join(",");

const series = (store: Map<string, Map<string, number>>, name: string) => {
  let s = store.get(name);
  if (!s) store.set(name, (s = new Map()));
  return s;
};

export const metrics = {
  inc(name: string, labels?: Labels, by = 1) {
    const s = series(counters, name);
    const k = key(labels);
    s.set(k, (s.get(k) ?? 0) + by);
  },
  set(name: string, value: number, labels?: Labels) {
    series(gauges, name).set(key(labels), value);
  },
  get(name: string, labels?: Labels) {
    return counters.get(name)?.get(key(labels)) ?? gauges.get(name)?.get(key(labels));
  },
  render(): string {
    const lines: string[] = [];
    for (const [type, store] of [["counter", counters], ["gauge", gauges]] as const) {
      for (const [name, s] of store) {
        lines.push(`# TYPE ${name} ${type}`);
        for (const [l, v] of s) lines.push(`${name}${l ? `{${l}}` : ""} ${v}`);
      }
    }
    return `${lines.join("\n")}\n`;
  },
  reset() {
    counters.clear();
    gauges.clear();
  },
};
