import { PoseLandmarker } from "@mediapipe/tasks-vision";
import { contains, type Box, type Handle } from "./box";
import type { Handedness } from "./hand";
import type { MachineView } from "./commands";
import type { HandSource } from "./handedness";
import { drawKnob, type KnobDraw } from "./knobHud";
import type { PoseLm } from "./poseCrop";

/**
 * The HUD canvas: the command zone, palm-centre markers with an L / R label, and the dwell rings.
 * Unlike the skeleton canvas it is NOT mirrored, so it is drawn directly in
 * display coordinates and its text reads normally.
 */

const ACCENT = "#5cc8ff";
const ON = "#38e08c";
const WARN = "#ffb020";
const OFF = "#ff5d6c";

export interface HudInput {
  /** R6: the one command zone both hands use (display-normalized). */
  zone: Box;
  /** The handle of the zone under the pointer / being dragged. */
  active: Handle | null;
  dragging: boolean;
  /** Detected hands: palm centre (display-normalized), which hand, and how that was decided (a default is shown with a "?"). */
  palms: readonly { hand: Handedness; x: number; y: number; source?: HandSource }[];
  /** Each hand's command ring, if it has one. */
  views: Partial<Record<Handedness, MachineView>>;
  /** R4b: the knob dial and the big GRABBED word, while the knob is held. */
  knob?: KnobDraw | null;
  /** R6: with zoom on, what the model is given (display space) and how much bigger that makes a hand to it. */
  crop?: { box: Box; magnification: number } | null;
  /** R8 auto-track: the pose skeleton (full-frame raw coordinates, as the pose model gives them) and the crops the hand model was given (display space). */
  track?: { pose: readonly PoseLm[] | null; crops: readonly { box: Box; label: string; magnification: number }[] } | null;
}

/** The dancer's right hand is blue, the left purple (the L / R labels on the hands). */
const HAND_COLOR: Record<Handedness, string> = { Right: ACCENT, Left: "#c79bff" };
const SIDE_LETTER: Record<Handedness, string> = { Right: "R", Left: "L" };

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
  const zone = input.zone;
  const bx = zone.x * W;
  const by = zone.y * H;
  const bw = zone.w * W;
  const bh = zone.h * H;
  // Lit while any hand's palm centre is inside the zone.
  const occupied = input.palms.some((p) => contains(zone, p));
  const color = occupied ? ON : ACCENT;
  ctx.fillStyle = occupied ? "rgba(56,224,140,0.10)" : "rgba(92,200,255,0.07)";
  ctx.fillRect(bx, by, bw, bh);
  ctx.lineWidth = (occupied ? 6 : 4) * s;
  ctx.strokeStyle = color;
  ctx.strokeRect(bx, by, bw, bh);
  text(ctx, "COMMAND ZONE: both hands (palm centre inside)", bx + 14 * s, by + 32 * s, 20 * s, color);

  // Zoom: what the hand model is given, and how much bigger a hand is to it. Hands outside are not tracked at all.
  if (input.crop) {
    const c = input.crop.box;
    ctx.save();
    ctx.setLineDash([10 * s, 8 * s]);
    ctx.lineWidth = 3 * s;
    ctx.strokeStyle = WARN;
    ctx.strokeRect(c.x * W, c.y * H, c.w * W, c.h * H);
    ctx.restore();
    text(ctx, `ZOOM ×${input.crop.magnification.toFixed(1)}: only this is tracked`, (c.x + c.w) * W - 14 * s, (c.y + c.h) * H + 24 * s, 20 * s, WARN, "right");
  }

  if (input.track) drawTrack(ctx, input.track, W, H, s);

  // Drag handles: small squares on the corners and edge midpoints.
  for (const [h, hx, hy] of handlePoints(zone)) {
    const lit = input.active === h;
    const size = (lit ? 18 : 12) * s;
    ctx.fillStyle = lit ? "#ffffff" : color;
    ctx.fillRect(hx * W - size / 2, hy * H - size / 2, size, size);
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = "#000";
    ctx.strokeRect(hx * W - size / 2, hy * H - size / 2, size, size);
  }
  if (input.active === "move") {
    text(ctx, input.dragging ? "release to set" : "drag to move", bx + bw / 2, by + bh / 2, 20 * s, "rgba(255,255,255,0.7)", "center");
  }

  // Per-hand status lines at the zone's bottom edge: the cooldown and why a hand is not counting.
  let line = 0;
  for (const hand of hands) {
    const view = input.views[hand];
    if (!view) continue;
    if (view.cooldownLeftMs > 0) text(ctx, `${SIDE_LETTER[hand]} COOLDOWN ${(view.cooldownLeftMs / 1000).toFixed(1)} s`, bx + bw - 14 * s, by + 32 * s + line++ * 24 * s, 20 * s, WARN, "right");
  }
  line = 0;
  for (const hand of hands) {
    const view = input.views[hand];
    if (view && view.blocked && view.phase === "idle") text(ctx, `${SIDE_LETTER[hand]}: not counting: ${view.blocked}`, bx + 14 * s, by + bh - 14 * s - line++ * 26 * s, 22 * s, WARN, "left");
  }

  // Palm centres: the exact point tested against the zone, with the hand the app thinks it is (L / R, "?" = assumed).
  for (const p of input.palms) {
    const inside = contains(zone, p);
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
    // The hand label: a small chip above the marker.
    const letter = SIDE_LETTER[p.hand] + (p.source === "default" ? "?" : "");
    const cw = (p.source === "default" ? 40 : 30) * s;
    ctx.fillStyle = HAND_COLOR[p.hand];
    ctx.beginPath();
    ctx.roundRect(x - cw / 2, y - 46 * s, cw, 28 * s, 8 * s);
    ctx.fill();
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = "#000";
    ctx.stroke();
    ctx.font = `800 ${20 * s}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#06101a";
    ctx.fillText(letter, x, y - 25 * s);
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

const POSE_COLOR = "rgba(255,255,255,0.75)";
const CROP_COLOR = "#ff7ad9";

/** R8: the pose skeleton (thin; the wrists as dots) and each crop's outline with its magnification. The HUD is not mirrored, so raw x flips. */
function drawTrack(ctx: CanvasRenderingContext2D, track: NonNullable<HudInput["track"]>, W: number, H: number, s: number): void {
  const pose = track.pose;
  if (pose) {
    const ok = (p: PoseLm | undefined): p is PoseLm => !!p && (p.visibility ?? 1) >= 0.3;
    const px = (p: PoseLm) => (1 - p.x) * W;
    const py = (p: PoseLm) => p.y * H;
    ctx.save();
    ctx.lineWidth = 1.5 * s;
    ctx.lineCap = "round";
    ctx.strokeStyle = POSE_COLOR;
    ctx.beginPath();
    for (const { start, end } of PoseLandmarker.POSE_CONNECTIONS) {
      // The face dots and the legs are noise here: head, torso and arms only.
      if (start > 22 || end > 22) continue;
      const a = pose[start];
      const b = pose[end];
      if (!ok(a) || !ok(b)) continue;
      ctx.moveTo(px(a), py(a));
      ctx.lineTo(px(b), py(b));
    }
    ctx.stroke();
    for (const [i, side] of [[15, "L"], [16, "R"]] as const) {
      const p = pose[i];
      if (!ok(p)) continue;
      ctx.fillStyle = CROP_COLOR;
      ctx.beginPath();
      ctx.arc(px(p), py(p), 4 * s, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, side, px(p) + 8 * s, py(p) - 6 * s, 14 * s, CROP_COLOR);
    }
    ctx.restore();
  }
  for (const c of track.crops) {
    ctx.save();
    ctx.setLineDash([8 * s, 6 * s]);
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = CROP_COLOR;
    ctx.strokeRect(c.box.x * W, c.box.y * H, c.box.w * W, c.box.h * H);
    ctx.restore();
    text(ctx, `${c.label} ×${c.magnification.toFixed(1)}`, c.box.x * W + 6 * s, c.box.y * H + 18 * s, 15 * s, CROP_COLOR);
  }
}
