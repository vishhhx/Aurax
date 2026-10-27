/**
 * Process health.
 * - live: the process is up and the event loop responds.
 * - ready: market state is initialised, both consumers are running, and the
 *   service is not shutting down. Data endpoints return 503 until then.
 */
type Phase = "starting" | "ready" | "stopping";

const state = {
  phase: "starting" as Phase,
  startedAt: Date.now(),
  consumers: new Map<string, "running" | "crashed">(),
  lastError: null as string | null,
};

export const health = {
  setPhase(phase: Phase): void {
    state.phase = phase;
  },
  setConsumer(name: string, status: "running" | "crashed"): void {
    state.consumers.set(name, status);
  },
  setError(message: string | null): void {
    state.lastError = message;
  },
  isReady(): boolean {
    if (state.phase !== "ready") return false;
    for (const status of state.consumers.values()) if (status !== "running") return false;
    return true;
  },
  snapshot() {
    return {
      phase: state.phase,
      ready: health.isReady(),
      uptimeMs: Date.now() - state.startedAt,
      consumers: Object.fromEntries(state.consumers),
      lastError: state.lastError,
    };
  },
};
