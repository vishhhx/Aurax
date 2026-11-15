/**
 * Renders marketing images with headless Chrome:
 *   terminal.html      → public/brand/hero-dashboard.png   (2400×1305, illustrative data)
 *   public/logo.svg    → app/apple-icon.png (180) and public/logo-512.png
 * Run from apps/web: bun scripts/hero-mock/render.ts
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const web = resolve(import.meta.dir, "../..");
const profile = mkdtempSync(join(tmpdir(), "aurax-render-"));

function shot(url: string, out: string, w: number, h: number, scale = 1) {
  const r = spawnSync("google-chrome", [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--default-background-color=00000000",
    `--user-data-dir=${profile}`, `--window-size=${w},${h}`, `--force-device-scale-factor=${scale}`,
    "--virtual-time-budget=6000", `--screenshot=${out}`, url,
  ], { stdio: "ignore", timeout: 90_000 });
  if (r.status !== 0) throw new Error(`chrome failed for ${url}`);
  console.log("wrote", out);
}

shot(`file://${join(web, "scripts/hero-mock/terminal.html")}`, join(web, "public/brand/hero-dashboard.png"), 1600, 870, 1.5);

// Square icon renders of the SVG logo (transparent corners outside the rounded tile).
const icon = (size: number) => {
  const page = join(profile, `icon-${size}.html`);
  writeFileSync(page, `<html><body style="margin:0;background:transparent"><img src="file://${join(web, "public/logo.svg")}" width="${size}" height="${size}"></body></html>`);
  return `file://${page}`;
};
shot(icon(180), join(web, "app/apple-icon.png"), 180, 180);
shot(icon(512), join(web, "public/logo-512.png"), 512, 512);

rmSync(profile, { recursive: true, force: true });
