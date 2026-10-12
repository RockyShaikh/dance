/**
 * DEV ONLY (imported dynamically from main.ts under `import.meta.env.DEV`; not in the
 * production build). `?sim` runs the test bench with no camera and no model: a test
 * driver or the console scripts hands with `window.__dance.setHands([...])`, and the
 * real feature code, classifier, clutch detectors and UI run on them.
 *
 *   __dance.setHands([{ shape: "Victory", hand: "Right", palm: { x: 0.75, y: 0.5 } }])
 *   __dance.setHands([])   // no hands
 *
 * Landmarks come from the unit-test fixtures (a hand laid out by hand), placed so the
 * palm centre lands exactly at `palm` (display-normalized, as the user sees it).
 * The recognizer's shape label is simply taken from `shape`.
 */
import { readHand, type HandReading } from "./analyze";
import { LM, type Handedness, type Point3 } from "./hand";
import { palmCentre } from "./handFeatures";
import { makeHand } from "./test/fixtures";

export interface SimHand {
  /** The label the Gesture Recognizer would give, e.g. "Open_Palm". */
  shape: string;
  /** The dancer's own hand. Default Right. */
  hand?: Handedness;
  /** Palm centre in display-normalized coordinates. Default: the middle of the right half. */
  palm?: { x: number; y: number };
  /** Recognizer confidence. Default 0.9. */
  score?: number;
  /** Which fingers are really out, as five bits T I M R P (e.g. "10001" is a shaka), instead of the label's own pose: the label can disagree with the fingers, as the model's does. */
  fingers?: string;
  /** Turn the back of the hand to the camera. */
  away?: boolean;
  /** Thumb-tip to index-tip gap in palm sizes; omit for the shape's natural pose. */
  pinch?: number;
  /** Curl all four fingers by this fraction (0 straight, 1 fist) instead of the shape's pose. */
  curl?: number;
  /** Hand size scale (default 2). */
  scale?: number;
  /** Knob tilt: the hand's needle against straight up, degrees clockwise as the user sees the mirrored picture (default 0). */
  tilt?: number;
}

export const SIM_SIZE = { width: 1280, height: 720 } as const;

/** A dark placeholder picture to stand in for the camera frame. */
export function simBackdrop(): string {
  const c = document.createElement("canvas");
  c.width = SIM_SIZE.width;
  c.height = SIM_SIZE.height;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, c.width, c.height);
  grad.addColorStop(0, "#1c2430");
  grad.addColorStop(1, "#0e1218");
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "rgba(255,255,255,0.12)";
  g.font = "700 40px system-ui, sans-serif";
  g.textAlign = "center";
  // The picture is mirrored for display, so write it backwards to read normally.
  g.save();
  g.translate(c.width / 2, c.height - 30);
  g.scale(-1, 1);
  g.fillText("SIMULATED CAMERA (dev ?sim)", 0, 0);
  g.restore();
  return c.toDataURL("image/png");
}

const FINGERS: Record<string, string> = {
  Open_Palm: "11111",
  Pointing_Up: "01000",
  Victory: "01100",
  Closed_Fist: "00000",
  Thumb_Up: "10000",
  None: "00000",
};

export function simReading(s: SimHand): HandReading {
  const { width, height } = SIM_SIZE;
  const hand = s.hand ?? "Right";
  const bits = s.fingers ?? FINGERS[s.shape] ?? "00000";
  const spec = {
    hand,
    fingers: {
      T: bits[0] === "1",
      I: bits[1] === "1",
      M: bits[2] === "1",
      R: bits[3] === "1",
      P: bits[4] === "1",
    },
    yawDeg: s.away ? 180 : 0,
    // makeHand's roll is clockwise in the raw (un-mirrored) image, which is counter-clockwise on the mirrored display.
    rollDeg: -(s.tilt ?? 0),
    scale: s.scale ?? 2,
    curl: s.curl,
  };

  // Lay the hand out at the origin, then translate so the palm centre lands where asked.
  let pts: Point3[] = makeHand({ ...spec, at: { x: 0, y: 0 } });
  const here = palmCentre(pts.map((p) => ({ x: p.x / width, y: p.y / height })));
  // palmCentre is in display coordinates (x flipped): raw x = 1 - display x, so the raw shift is (here - want).
  const want = s.palm ?? { x: 0.75, y: 0.5 };
  const dx = (here.x - want.x) * width;
  const dy = want.y * height - here.y * height;
  pts = pts.map((p) => ({ x: p.x + dx, y: p.y + dy, z: p.z }));

  if (s.pinch !== undefined) {
    const palm = Math.hypot(pts[LM.MIDDLE_MCP].x - pts[LM.WRIST].x, pts[LM.MIDDLE_MCP].y - pts[LM.WRIST].y);
    const tip = pts[LM.INDEX_TIP];
    pts[LM.THUMB_TIP] = { x: tip.x + s.pinch * palm, y: tip.y, z: tip.z };
  }

  const landmarks = pts.map((p) => ({ x: p.x / width, y: p.y / height, z: p.z / width, visibility: 1 }));
  return readHand(landmarks, hand, 0.95, s.shape, s.score ?? 0.9, width, height);
}
