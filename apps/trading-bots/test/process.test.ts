import { afterAll, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { RUN_DIR, writeJson } from "../src/lib/config";
import { alive, running, stop, stopAll } from "../src/lib/launcher";

// Stand-in children that behave like bots towards the process manager (run file + SIGTERM).
const spawnFake = (id: string, ignoreTerm = false) => {
  const code = ignoreTerm ? "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)" : "setInterval(()=>{},1000)";
  const c = spawn(process.execPath, ["-e", code], { detached: true, stdio: "ignore" });
  c.unref();
  writeJson(join(RUN_DIR, `${id}.json`), { pid: c.pid, id, status: "active", ws: true, book: "synced", open: 0, sessionNotional: 0, lastError: "", heartbeat: Date.now() });
  return c.pid!;
};

afterAll(() => ["t-a", "t-b", "t-c", "t-dead"].forEach((id) => rmSync(join(RUN_DIR, `${id}.json`), { force: true })));

test("stops one bot without touching the others, then stops all", async () => {
  const a = spawnFake("t-a"), b = spawnFake("t-b");
  expect(running().map((r) => r.id)).toEqual(expect.arrayContaining(["t-a", "t-b"]));
  expect(await stop("t-a")).toBe(true);
  expect(alive(a)).toBe(false);
  expect(alive(b)).toBe(true);
  await stopAll();
  expect(alive(b)).toBe(false);
});

test("escalates to SIGKILL so nothing is orphaned", async () => {
  const c = spawnFake("t-c", true);
  await stop("t-c", 500);
  expect(alive(c)).toBe(false);
});

test("a dead bot is pruned instead of crashing the controller", () => {
  writeJson(join(RUN_DIR, "t-dead.json"), { pid: 2 ** 22 + 7, id: "t-dead" });
  expect(running().find((r) => r.id === "t-dead")).toBeUndefined();
});
