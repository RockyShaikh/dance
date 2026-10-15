import { contains, type Box, type Handle } from "./box";
import type { Handedness } from "./hand";
import type { MachineView } from "./commands";
import { drawKnob, type KnobDraw } from "./knobHud";

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
  /** R4b: each hand's command box. */
  boxes: Record<Handedness, Box>;
  /** The box and handle under the pointer / being dragged. */
  active: { hand: Handedness; handle: Handle } | null;
  dragging: boolean;
  /** Detected hands: palm centre (display-normalized) and which hand. */
  palms: readonly { hand: Handedness; x: number; y: number }[];
  /** Each hand's command ring, if it has one. */
  views: Partial<Record<Handedness, MachineView>>;
  /** R4b: the knob dial and the big GRABBED word, while the knob is held. */
  knob?: KnobDraw | null;
}

/** The dancer's right hand appears on the right of the mirrored picture, so its box is blue; the left hand's is purple. */
const HAND_COLOR: Record<Handedness, string> = { Right: ACCENT, Left: "#c79bff" };
const HAND_LABEL: Record<Handedness, string> = { Right: "RIGHT HAND: PLAY / RESTART / CLEAR / SPEED", Left: "LEFT HAND: MARK START / END" };

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

  const hands: Handedness[] = ["Left", "Right"];
  for (const hand of hands) {
    const box = input.boxes[hand];
    const bx = box.x * W;
    const by = box.y * H;
    const bw = box.w * W;
    const bh = box.h * H;
    // Lit while that hand's palm centre is inside its own box.
    const occupied = input.palms.some((p) => p.hand === hand && contains(box, p));
    const base = HAND_COLOR[hand];
    const color = occupied ? ON : base;
    ctx.fillStyle = occupied ? "rgba(56,224,140,0.10)" : hand === "Right" ? "rgba(92,200,255,0.07)" : "rgba(199,155,255,0.07)";
    ctx.fillRect(bx, by, bw, bh);
    ctx.lineWidth = (occupied ? 6 : 4) * s;
    ctx.strokeStyle = color;
    ctx.setLineDash(hand === "Left" ? [14 * s, 8 * s] : []);
    ctx.strokeRect(bx, by, bw, bh);
    ctx.setLineDash([]);
    text(ctx, HAND_LABEL[hand], bx + 14 * s, by + 32 * s, 20 * s, color);

    // Drag handles: small squares on the corners and edge midpoints.
    const mine = input.active?.hand === hand ? input.active.handle : null;
    for (const [h, hx, hy] of handlePoints(box)) {
      const lit = mine === h;
      const size = (lit ? 18 : 12) * s;
      ctx.fillStyle = lit ? "#ffffff" : color;
      ctx.fillRect(hx * W - size / 2, hy * H - size / 2, size, size);
      ctx.lineWidth = 2 * s;
      ctx.strokeStyle = "#000";
      ctx.strokeRect(hx * W - size / 2, hy * H - size / 2, size, size);
    }
    if (mine === "move") {
      text(ctx, input.dragging ? "release to set" : "drag to move", bx + bw / 2, by + bh / 2, 20 * s, "rgba(255,255,255,0.7)", "center");
    }

    const view = input.views[hand];
    if (view) {
      if (view.cooldownLeftMs > 0) text(ctx, `COOLDOWN ${(view.cooldownLeftMs / 1000).toFixed(1)} s`, bx + bw - 14 * s, by + 56 * s, 20 * s, WARN, "right");
      if (view.blocked && view.phase === "idle") text(ctx, `Not counting: ${view.blocked}`, bx + bw / 2, by + bh - 16 * s, 24 * s, WARN, "center");
    }
  }

  // Palm centres: the exact point tested against that hand's own box.
  for (const p of input.palms) {
    const inside = contains(input.boxes[p.hand], p);
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

  if (input.knob) drawKnob(ctx, input.knob);

  // Dwell rings at each hand that is being tracked.
  for (const hand of hands) {
    const view = input.views[hand];
    if (!view || !view.shape || !view.palm) continue;
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
