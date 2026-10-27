/** Cancel every open order of every provisioned bot (also used by bots on shutdown). Retries through gateway 429s. */
import { assertDevOnly, loadPlan } from "./lib/config";
import { AuraxHttp, HttpError } from "./lib/http";

export async function cancelAllOpen(http: AuraxHttp, symbol: string, log: (m: string) => void = () => {}): Promise<number> {
  let cancelled = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    const open = await http.openOrders(symbol).catch((e: HttpError) => (e.status === 429 ? null : []));
    if (open && !open.length) break;
    const results = await Promise.allSettled((open ?? []).map((o) => http.cancel(o.orderId)));
    cancelled += results.filter((r) => r.status === "fulfilled").length;
    if (open && results.every((r) => r.status === "fulfilled")) break;
    log(`some cancels failed (rate limit?); retrying in 2s`);
    await Bun.sleep(2000);
  }
  return cancelled;
}

if (import.meta.main) {
  assertDevOnly();
  for (const b of loadPlan()?.bots.filter((x) => x.userId) ?? []) {
    const n = await cancelAllOpen(new AuraxHttp({ userId: b.userId!, email: b.email!, name: b.name }), b.symbol);
    console.log(`${b.name.padEnd(22)} cancelled ${n}`);
  }
}
