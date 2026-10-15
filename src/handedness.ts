/**
 * R6: left or right from the THUMB, not from the screen side and not from the model's label.
 *
 * The dancer's palm is assumed to face the camera. Then the thumb is always on the same side of the hand's own axis
 * (wrist to middle knuckle): for the dancer's RIGHT hand, as the un-mirrored camera sees it, clockwise of the axis
 * (to the image right of an upright hand); for the LEFT hand, counter-clockwise. The rule uses the thumb's base (its
 * MCP joint), not the tip: the base stays on the thumb's side of the palm in a fist, a thumbs up and a tucked thumb,
 * where the tip wanders. It is measured against the hand's own axis, so it holds at any rotation in the image plane.
 *
 * Pure: landmarks in isotropic image space (analyze.ts `toIsotropic`), raw (un-mirrored) as the model sees them.
 */
import { HANDEDNESS } from "./config";
import { LM, type Handedness, type Point3 } from "./hand";

export interface ThumbSide {
  hand: Handedness;
  /** Signed sine of the angle from the axis to the thumb's base: positive = right hand. */
  signed: number;
  /** |signed|: 0 = the thumb sits on the axis (no information), about 0.5 to 0.9 on a hand with the palm to the camera. */
  conf: number;
}

export function thumbSide(lm: readonly Point3[]): ThumbSide {
  const w = lm[LM.WRIST];
  const ax = lm[LM.MIDDLE_MCP].x - w.x;
  const ay = lm[LM.MIDDLE_MCP].y - w.y;
  const tx = lm[LM.THUMB_MCP].x - w.x;
  const ty = lm[LM.THUMB_MCP].y - w.y;
  const norm = Math.hypot(ax, ay) * Math.hypot(tx, ty);
  // Image y points down, so a positive cross product is clockwise on screen: the thumb to the image right of an upright hand.
  const signed = norm === 0 ? 0 : (ax * ty - ay * tx) / norm;
  return { hand: signed >= 0 ? "Right" : "Left", signed, conf: Math.abs(signed) };
}

/** What `assignHands` needs about each detected hand. */
export interface HandCandidate {
  thumb: ThumbSide;
  /** The model's own label, already corrected for APP.swapHandedness. */
  modelHand: Handedness;
}

/** How a hand's label was decided. */
export type HandSource = "thumb" | "pair" | "default" | "model";

export interface HandAssignment {
  hand: Handedness;
  source: HandSource;
}

export interface HandednessCfg {
  source: "thumb" | "model";
  minThumbConf: number;
  defaultHand: Handedness;
}

const opposite = (h: Handedness): Handedness => (h === "Left" ? "Right" : "Left");

/**
 * Labels for the hands in view, in the order given.
 *  - Two hands: each by its thumb; if both come out the same, the more confident keeps its label and the other gets the opposite.
 *  - One hand: its thumb if confident, else `defaultHand` (the dancer's right).
 *  - `source: "model"` (the fallback) takes the model's labels as they are.
 */
export function assignHands(cands: readonly HandCandidate[], cfg: HandednessCfg = HANDEDNESS): HandAssignment[] {
  if (cfg.source === "model") return cands.map((c) => ({ hand: c.modelHand, source: "model" }));
  if (cands.length === 1) {
    const t = cands[0].thumb;
    return [t.conf >= cfg.minThumbConf ? { hand: t.hand, source: "thumb" } : { hand: cfg.defaultHand, source: "default" }];
  }
  const out: HandAssignment[] = cands.map((c) => ({ hand: c.thumb.hand, source: "thumb" }));
  if (cands.length === 2 && out[0].hand === out[1].hand) {
    const weaker = cands[0].thumb.conf >= cands[1].thumb.conf ? 1 : 0;
    out[weaker] = { hand: opposite(out[weaker].hand), source: "pair" };
  }
  return out;
}
