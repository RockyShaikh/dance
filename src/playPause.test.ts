import { describe, expect, it } from "vitest";
import { COMMANDS } from "./config";
import { evaluateHands } from "./commands";
import { PLAY_PAUSE_DEFAULT, playPauseShape, readPlayPause, withPlayPause } from "./playPause";
import { stepHandCommands, INITIAL_MACHINES } from "./handCommands";
import { defaultSettings } from "./settings";

const palm = { x: 0.5, y: 0.1 };
const box = { x: 0, y: 0, w: 1, h: 0.25 };
const hand = (shape: string, extra = {}) => ({ shape, shapeScore: 0.95, palmFacing: true, palm, ...extra });

describe("play/pause gesture choice (R9b)", () => {
  it("defaults to the open palm, and a stored value is validated", () => {
    expect(PLAY_PAUSE_DEFAULT).toBe("palm");
    expect(defaultSettings().playPauseGesture).toBe("palm");
    expect(readPlayPause("fist")).toBe("fist");
    expect(readPlayPause("palm")).toBe("palm");
    expect(readPlayPause("banana")).toBe("palm");
    expect(readPlayPause(undefined, "fist")).toBe("fist");
  });
  it("maps the choice to the model's label", () => {
    expect(playPauseShape("palm")).toBe("Open_Palm");
    expect(playPauseShape("fist")).toBe("Closed_Fist");
  });
  it("palm: arms Open_Palm (right only), not the fist; index and V stay armed", () => {
    const c = withPlayPause(COMMANDS, "palm");
    expect(c.shapes).toContain("Open_Palm");
    expect(c.shapes).not.toContain("Closed_Fist");
    expect(c.shapes).toEqual(expect.arrayContaining(["Pointing_Up", "Victory"]));
    expect(c.rightOnlyShapes).toEqual(["Open_Palm"]);
    expect(evaluateHands([hand("Closed_Fist")], box, c).hand).toBeNull();
    expect(evaluateHands([hand("Open_Palm")], box, c).hand).not.toBeNull();
  });
  it("fist: arms Closed_Fist, not the palm; the fist / thumbs-up chord guard still applies", () => {
    const c = withPlayPause(COMMANDS, "fist");
    expect(c.shapes).toContain("Closed_Fist");
    expect(c.shapes).not.toContain("Open_Palm");
    expect(evaluateHands([hand("Open_Palm")], box, c).hand).toBeNull();
    expect(evaluateHands([hand("Closed_Fist")], box, c).hand).not.toBeNull();
    // a "fist" whose thumb is out is a thumbs up: the guard blocks it
    const thumbOut = { T: true, I: false, M: false, R: false, P: false };
    expect(evaluateHands([hand("Closed_Fist", { chord: thumbOut })], box, c).blocked).toBe("fingers disagree");
  });
  it("palm: only the RIGHT hand's palm fires; a left palm (the anchor) arms nothing", () => {
    const c = withPlayPause({ ...COMMANDS, dwellMs: 100 }, "palm");
    let st = INITIAL_MACHINES;
    const fires: string[] = [];
    for (let t = 0; t <= 800; t += 33) {
      const r = stepHandCommands(st, { t, hands: [{ ...hand("Open_Palm"), hand: "Left" as const }], boxes: { Left: box, Right: box }, suppress: { Left: false, Right: false } }, c);
      st = r.state;
      fires.push(...r.fired.map((f) => f.hand));
    }
    expect(fires).toEqual([]);
    for (let t = 1000; t <= 1800; t += 33) {
      const r = stepHandCommands(st, { t, hands: [{ ...hand("Open_Palm"), hand: "Right" as const }], boxes: { Left: box, Right: box }, suppress: { Left: false, Right: false } }, c);
      st = r.state;
      fires.push(...r.fired.map((f) => `${f.hand}:${f.shape}`));
    }
    expect(fires).toEqual(["Right:Open_Palm"]);
  });
});
