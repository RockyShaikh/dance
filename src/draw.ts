import { GestureRecognizer } from "@mediapipe/tasks-vision";
import type { HandReading } from "./analyze";
import { LM } from "./hand";

const LINE = "#5cc8ff";
const DOT = "#ffffff";
const UP = "#38e08c";
const DOWN = "#ff5d6c";

const TIPS = [
  ["T", LM.THUMB_TIP],
  ["I", LM.INDEX_TIP],
  ["M", LM.MIDDLE_TIP],
  ["R", LM.RING_TIP],
  ["P", LM.PINKY_TIP],
] as const;

/**
 * Draws the skeleton (21 dots plus connecting lines) for each hand.
 * The canvas has the video's pixel size and is mirrored by CSS together with the
 * video, so landmarks are drawn in raw frame coordinates with no flipping here.
 * Fingertips are coloured by pseudo-chord state: green = extended, red = curled.
 */
export function drawHands(ctx: CanvasRenderingContext2D, hands: readonly HandReading[]): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  const unit = Math.max(2, width / 400);

  for (const h of hands) {
    const pts = h.landmarks.map((p) => ({ x: p.x * width, y: p.y * height }));

    ctx.lineWidth = unit;
    ctx.lineCap = "round";
    ctx.strokeStyle = LINE;
    ctx.beginPath();
    for (const { start, end } of GestureRecognizer.HAND_CONNECTIONS) {
      ctx.moveTo(pts[start].x, pts[start].y);
      ctx.lineTo(pts[end].x, pts[end].y);
    }
    ctx.stroke();

    ctx.fillStyle = DOT;
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, unit * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.lineWidth = unit * 0.6;
    ctx.strokeStyle = "#000";
    for (const [key, idx] of TIPS) {
      const p = pts[idx];
      ctx.fillStyle = h.chord[key] ? UP : DOWN;
      ctx.beginPath();
      ctx.arc(p.x, p.y, unit * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}
