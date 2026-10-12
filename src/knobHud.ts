import type { Vec2 } from "./box";
import { KNOB } from "./config";
import type { KnobView } from "./knob";

/**
 * R4b: what the HUD canvas shows while the knob is grabbed: a big GRABBED word, and a dial at the
 * hand. Tilt: the needle (where the hand points now) against a tick at the grab angle (centre), with
 * the joystick's dead zone shaded. Circling: an arc of the turn so far and a turn counter.
 * The HUD canvas is not mirrored, so everything is drawn in display coordinates and angles are the
 * same clockwise-from-up degrees the knob uses.
 */

const ON = "#38e08c";
const WARN = "#ffb020";
const LOOP = "#ffd23f";

export interface KnobDraw {
  view: KnobView;
  /** Where the steering hand is (display-normalized): the dial sits there. */
  palm: Vec2;
  /** "Claw + Tilt + Joystick". */
  title: string;
  deadZoneDeg: number;
  /** Under GRABBED: "no loop START yet", etc. Empty for none. */
  note: string;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

function label(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, px: number, color: string): void {
  ctx.font = `800 ${px}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.lineWidth = px / 5;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.lineJoin = "round";
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

/** A wedge of the dial from angle a0 to a1 (degrees clockwise from up). */
function wedge(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, a0: number, a1: number, fill: string): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  // Canvas angles run clockwise from 3 o'clock; "from up" is 90 degrees earlier.
  ctx.arc(cx, cy, r, rad(a0 - 90), rad(a1 - 90));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function spoke(ctx: CanvasRenderingContext2D, cx: number, cy: number, r0: number, r1: number, deg: number, width: number, color: string): void {
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx + r0 * Math.sin(rad(deg)), cy - r0 * Math.cos(rad(deg)));
  ctx.lineTo(cx + r1 * Math.sin(rad(deg)), cy - r1 * Math.cos(rad(deg)));
  ctx.stroke();
}

export function drawKnob(ctx: CanvasRenderingContext2D, k: KnobDraw): void {
  const { width: W, height: H } = ctx.canvas;
  const s = W / 1280;
  const { view } = k;
  const accent = view.frozen ? WARN : ON;

  // The big word, top centre.
  label(ctx, view.frozen ? "HOLDING: hand lost" : "GRABBED", W / 2, 84 * s, 76 * s, accent);
  label(ctx, k.title, W / 2, 120 * s, 26 * s, "#fff");
  if (k.note) label(ctx, k.note, W / 2, 152 * s, 24 * s, WARN);

  // The dial at the hand.
  const cx = k.palm.x * W;
  const cy = k.palm.y * H;
  const r = 118 * s;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 6 * s;
  ctx.strokeStyle = accent;
  ctx.stroke();

  if (view.motion === "tilt") {
    if (view.mapping === "joystick") {
      // Where you grabbed is centre; the dead zone does nothing, the rate rises out to full tilt.
      wedge(ctx, cx, cy, r, view.centreDeg - k.deadZoneDeg, view.centreDeg + k.deadZoneDeg, "rgba(255,255,255,0.18)");
      for (const sign of [-1, 1]) spoke(ctx, cx, cy, r * 0.8, r, view.centreDeg + sign * KNOB.joystick.fullTiltDeg, 4 * s, "rgba(255,255,255,0.5)");
    } else if (view.mapping === "absolute") {
      for (const sign of [-1, 1]) spoke(ctx, cx, cy, r * 0.8, r, sign * KNOB.absolute.worldRangeDeg, 4 * s, "rgba(255,255,255,0.5)");
      spoke(ctx, cx, cy, r * 0.9, r, 0, 4 * s, "rgba(255,255,255,0.35)");
    }
    spoke(ctx, cx, cy, 0, r * 1.05, view.centreDeg, 5 * s, LOOP); // the grab angle
    spoke(ctx, cx, cy, 0, r * 0.95, view.needleDeg, 10 * s, "#fff"); // the needle
    const off = view.needleDeg - view.centreDeg;
    label(ctx, `${off >= 0 ? "+" : "−"}${Math.abs(off).toFixed(0)}°`, cx, cy + r + 40 * s, 34 * s, "#fff");
  } else {
    // Circling: the turn so far, as an arc from the top, plus the turn count.
    const frac = (view.turnedDeg % 360) / 360;
    ctx.lineWidth = 12 * s;
    ctx.lineCap = "round";
    ctx.strokeStyle = LOOP;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.78, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2, frac < 0);
    ctx.stroke();
    const turns = view.turnedDeg / 360;
    label(ctx, view.warm ? `${turns >= 0 ? "+" : "−"}${Math.abs(turns).toFixed(2)} turns` : "keep circling…", cx, cy + r + 40 * s, 32 * s, "#fff");
    if (view.circleCentre) {
      const px = view.circleCentre.x * W;
      const py = view.circleCentre.y * H;
      ctx.lineWidth = 4 * s;
      ctx.strokeStyle = LOOP;
      ctx.beginPath();
      ctx.moveTo(px - 14 * s, py);
      ctx.lineTo(px + 14 * s, py);
      ctx.moveTo(px, py - 14 * s);
      ctx.lineTo(px, py + 14 * s);
      ctx.stroke();
    }
  }
}
