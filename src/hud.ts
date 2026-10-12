import { contains, type Box, type Handle } from "./box";
import type { MachineView } from "./commands";

/**
 * The HUD canvas: the command box, palm-centre markers and the dwell rings.
 * Unlike the skeleton canvas it is NOT mirrored, so it is drawn directly in
 * display coordinates and its text reads normally.
 */

const ACCENT = "#5cc8ff";
const ON = "#38e08c";
const WARN = "#ffb020";
const OFF = "#ff5d6c";

export interface HudInput {
  box: Box;
  /** Handle under the pointer / being dragged. */
  active: Handle | null;
  dragging: boolean;
  /** Palm centres of detected hands, display-normalized. */
  palms: readonly { x: number; y: number }[];
  view: MachineView | null;
}

export function prettyShape(label: string): string {
  const s = label.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function handlePoints(b: Box): [Handle, number, number][] {
  const l = b.x;
  const r = b.x + b.w;
  const t = b.y;
  const bt = b.y + b.h;
  const mx = b.x + b.w / 2;
  const my = b.y + b.h / 2;
  return [
    ["nw", l, t],
    ["n", mx, t],
    ["ne", r, t],
    ["e", r, my],
    ["se", r, bt],
    ["s", mx, bt],
    ["sw", l, bt],
    ["w", l, my],
  ];
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, px: number, color: string, align: CanvasTextAlign = "left"): void {
  ctx.font = `700 ${px}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.lineWidth = px / 5;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.lineJoin = "round";
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

function arc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, frac: number, width: number, color: string): void {
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  if (frac <= 0) return;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, frac));
  ctx.stroke();
}

export function drawHud(ctx: CanvasRenderingContext2D, input: HudInput): void {
  const { width: W, height: H } = ctx.canvas;
  const s = W / 1280; // pixel scale, so line widths look the same at any camera resolution
  ctx.clearRect(0, 0, W, H);

  const { box, view } = input;
  const bx = box.x * W;
  const by = box.y * H;
  const bw = box.w * W;
  const bh = box.h * H;
  const occupied = input.palms.some((p) => contains(box, p));

  // The box itself.
  const color = occupied ? ON : ACCENT;
  ctx.fillStyle = occupied ? "rgba(56,224,140,0.10)" : "rgba(92,200,255,0.07)";
  ctx.fillRect(bx, by, bw, bh);
  ctx.lineWidth = (occupied ? 6 : 4) * s;
  ctx.strokeStyle = color;
  ctx.setLineDash([]);
  ctx.strokeRect(bx, by, bw, bh);
  text(ctx, "COMMAND BOX", bx + 14 * s, by + 32 * s, 22 * s, color);

  // Drag handles: small squares on the corners and edge midpoints.
  for (const [h, hx, hy] of handlePoints(box)) {
    const lit = input.active === h;
    const size = (lit ? 18 : 12) * s;
    ctx.fillStyle = lit ? "#ffffff" : color;
    ctx.fillRect(hx * W - size / 2, hy * H - size / 2, size, size);
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = "#000";
    ctx.strokeRect(hx * W - size / 2, hy * H - size / 2, size, size);
  }
  if (input.dragging || input.active === "move") {
    text(ctx, input.dragging ? "release to set" : "drag to move", bx + bw / 2, by + bh / 2, 20 * s, "rgba(255,255,255,0.7)", "center");
  }

  // Palm centres: the exact point tested against the box.
  for (const p of input.palms) {
    const inside = contains(box, p);
    const x = p.x * W;
    const y = p.y * H;
    const r = 9 * s;
    ctx.lineWidth = 3 * s;
    ctx.strokeStyle = "#000";
    ctx.fillStyle = inside ? ON : OFF;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  if (!view) return;

  if (view.cooldownLeftMs > 0) {
    text(ctx, `COOLDOWN ${(view.cooldownLeftMs / 1000).toFixed(1)} s`, bx + bw - 14 * s, by + 32 * s, 22 * s, WARN, "right");
  }
  if (view.blocked && view.phase === "idle") {
    text(ctx, `Not counting: ${view.blocked}`, bx + bw / 2, by + bh - 16 * s, 24 * s, WARN, "center");
  }

  // Dwell rings at the hand that is being tracked.
  if (view.shape && view.palm) {
    const x = view.palm.x * W;
    const y = view.palm.y * H;
    const r = 56 * s;
    const full = view.progress >= 1;
    arc(ctx, x, y, r, view.progress, 12 * s, full ? ON : "#ffd23f");
    const below = y + r + 36 * s;
    text(ctx, prettyShape(view.shape), x, below, 26 * s, "#fff", "center");
    const note = view.phase === "dwell" ? "keep holding..." : view.phase === "spent" ? "fired: drop the hand to re-arm" : "";
    if (note) text(ctx, note, x, below + 28 * s, 20 * s, full ? ON : "#ffd23f", "center");
  }
}
