import { spawn, spawnSync } from "node:child_process";
import { readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APP_DIR, KILL_FILE, readJson, RUN_DIR, STOP_DIR } from "./config";

export type LaunchMode = "window" | "tmux" | "background";

export interface RunState {
  pid: number;
  id: string;
  status: string;
  ws: boolean;
  book: string;
  open: number;
  sessionNotional: number;
  lastError: string;
  heartbeat: number;
}

const has = (bin: string) => spawnSync("sh", ["-c", `command -v ${bin}`]).status === 0;

/** Terminal emulators in preference order, with how each runs a command in a new titled window. */
const EMULATORS: [string, (title: string, cmd: string[]) => string[]][] = [
  ["gnome-terminal", (t, c) => ["--title", t, "--", ...c]],
  ["ptyxis", (t, c) => ["--new-window", "--", ...c]],
  ["kitty", (t, c) => ["--title", t, ...c]],
  ["alacritty", (t, c) => ["--title", t, "-e", ...c]],
  ["wezterm", (_t, c) => ["start", "--", ...c]],
  ["konsole", (_t, c) => ["-e", ...c]],
  ["xfce4-terminal", (t, c) => ["--title", t, "-x", ...c]],
  ["xterm", (t, c) => ["-T", t, "-e", ...c]],
];

/** BOT_TERMINAL=window|tmux|background overrides detection. */
export function detectMode(): { mode: LaunchMode; emulator?: string } {
  const forced = process.env.BOT_TERMINAL as LaunchMode | undefined;
  const display = !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  const emulator = EMULATORS.find(([bin]) => has(bin))?.[0];
  if (forced === "background") return { mode: "background" };
  if (forced === "tmux" || (!forced && !(display && emulator) && has("tmux"))) return { mode: "tmux" };
  if (display && emulator) return { mode: "window", emulator };
  return { mode: "background" };
}

/**
 * Start one bot in its own process. In window/tmux mode the terminal owns the
 * process, so the bot writes .state/run/<id>.json (pid + heartbeat) and the
 * controller manages it by pid rather than by child handle.
 */
export function launch(id: string, name: string): string {
  const { mode, emulator } = detectMode();
  const stopMarker = join(STOP_DIR, id);
  rmSync(stopMarker, { force: true });
  // Supervised: a crashed bot restarts after 5s. A clean exit (SIGTERM, kill switch) or an
  // operator stop (marker file, also set before SIGKILL) ends the loop. The bot reads .env from its cwd.
  const inner = [
    `cd ${JSON.stringify(APP_DIR)}`,
    `while :; do ${JSON.stringify(process.execPath)} src/bot.ts ${id} 2>>.state/logs/${id}.err; code=$?`,
    `[ $code -eq 0 ] && break`,
    `{ [ -e ${JSON.stringify(stopMarker)} ] || [ -e ${JSON.stringify(KILL_FILE)} ]; } && break`,
    `echo "bot exited ($code) — see .state/logs/${id}.err — restarting in 5s"; sleep 5; done`,
  ].join("; ");
  if (mode === "window") {
    const build = EMULATORS.find(([b]) => b === emulator)![1];
    spawn(emulator!, build(name, ["bash", "-c", inner]), { detached: true, stdio: "ignore" }).unref();
    return `${emulator} window`;
  }
  if (mode === "tmux") {
    const exists = spawnSync("tmux", ["has-session", "-t", "aurax-bots"]).status === 0;
    const args = exists ? ["new-window", "-t", "aurax-bots", "-n", name] : ["new-session", "-d", "-s", "aurax-bots", "-n", name];
    spawnSync("tmux", [...args, "bash", "-c", inner]);
    return "tmux session aurax-bots (tmux attach -t aurax-bots)";
  }
  spawn("bash", ["-c", inner], { detached: true, stdio: "ignore" }).unref();
  return `background (logs: .state/logs/${id}.log)`;
}

export const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Running bots by run file; prunes files left by processes that died without cleanup. */
export function running(): RunState[] {
  const out: RunState[] = [];
  for (const f of readdirSync(RUN_DIR)) {
    const s = readJson<RunState>(join(RUN_DIR, f));
    if (s && alive(s.pid)) out.push(s);
    else rmSync(join(RUN_DIR, f), { force: true });
  }
  return out;
}

/** SIGTERM (bot cancels its orders and exits), then SIGKILL after a grace period. */
export async function stop(id: string, graceMs = 8000): Promise<boolean> {
  const s = running().find((r) => r.id === id);
  if (!s) return false;
  writeFileSync(join(STOP_DIR, id), new Date().toISOString()); // tells the supervisor loop not to restart
  process.kill(s.pid, "SIGTERM");
  const until = Date.now() + graceMs;
  while (alive(s.pid) && Date.now() < until) await Bun.sleep(200);
  if (alive(s.pid)) process.kill(s.pid, "SIGKILL");
  rmSync(join(RUN_DIR, `${id}.json`), { force: true });
  return true;
}

export const stopAll = () => Promise.all(running().map((r) => stop(r.id)));
