/**
 * Flicker- and scroll-free full-screen view: alternate screen buffer, cursor
 * homed on every frame, each line clipped to the terminal width (no wrapping)
 * and the frame clipped to its height, so redraws never push content upward.
 */
const ESC = "\x1b[";
const visible = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

function clip(line: string, width: number): string {
  if (visible(line).length <= width) return line;
  let out = "", n = 0;
  for (const part of line.split(/(\x1b\[[0-9;]*m)/)) {
    if (part.startsWith("\x1b[")) { out += part; continue; }
    for (const ch of part) { if (n >= width) return out + `${ESC}0m`; out += ch; n++; }
  }
  return out;
}

export class Screen {
  private active = !!process.stdout.isTTY;
  private last = "";

  constructor() {
    if (!this.active) return;
    process.stdout.write(`${ESC}?1049h${ESC}?25l${ESC}2J`);
    process.stdout.on("resize", () => (this.last = "", process.stdout.write(`${ESC}2J`)));
  }

  draw(frame: string): void {
    if (!this.active || frame === this.last) return;
    this.last = frame;
    const w = Math.max(20, (process.stdout.columns || 80) - 1), h = Math.max(5, process.stdout.rows || 40);
    const lines = frame.split("\n").slice(0, h).map((l) => clip(l, w) + `${ESC}K`);
    process.stdout.write(`${ESC}H${lines.join("\n")}${ESC}J`);
  }

  close(): void {
    if (this.active) process.stdout.write(`${ESC}?25h${ESC}?1049l`);
    this.active = false;
  }
}
