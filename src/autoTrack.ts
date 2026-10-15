/**
 * R8: auto-track, "our own Center Stage". Browser side: runs the Pose Landmarker on the full frame, turns its landmarks into
 * crops (poseCrop.ts), smooths them (cropSmooth.ts), runs the Gesture Recognizer on the crops and hands back ONE result in
 * full-frame coordinates, so everything downstream (analyze, the zone, the commands) is unchanged.
 *
 *  - off: the whole frame, or the R6 zone crop if the Zoom box is ticked (the caller passes that crop in).
 *  - person: one smoothed crop around head + shoulders + both hands, fed to the main recognizer (VIDEO mode). With no pose
 *    for ~1 s the crop relaxes to the full frame.
 *  - wrists: one smoothed square crop per visible wrist, each with its OWN recognizer instance (numHands 1).
 *
 * Why one recognizer per wrist, in VIDEO mode: the recognizer keeps its tracking state (where the hand was last frame) in the
 * coordinates of the previous input. One instance alternating between the left and the right crop would feed that state the
 * wrong picture every frame and mostly fall back to palm detection; one instance per wrist always sees "its" crop, which the
 * dead-band (cropSmooth.ts) keeps still most of the time, so tracking holds and the palm detector is skipped while a hand is
 * tracked. `?wrists=image` switches the instances to IMAGE mode (palm detector on every call, no state) for comparison.
 * With no wrist in view the whole frame goes to the main recognizer instead.
 */
import type { GestureRecognizer, GestureRecognizerResult, PoseLandmarker } from "@mediapipe/tasks-vision";
import { TRACK } from "./config";
import { mapLandmarks, mergeCropResults, type CropResult } from "./cropMerge";
import { IDLE_SMOOTH, smoothStep, type SmoothState } from "./cropSmooth";
import { personCropRect, visibleWrists, wristCrop, type PoseLm, type WristSide } from "./poseCrop";
import { loadPose, loadRecognizer } from "./recognizer";
import { atDetector, DetectionCounter, handLengthPx, palmWidthPx } from "./trackStats";
import { Cropper, cropLayout, magnification, type CropLayout } from "./zoom";

export type TrackMode = "off" | "person" | "wrists";
export const TRACK_MODES: readonly TrackMode[] = ["off", "person", "wrists"];

/** A crop the model was given this frame (raw frame coordinates, for the HUD outline). */
export interface TrackCrop {
  layout: CropLayout;
  label: string;
  magnification: number;
}

/** One detected hand's size, left-most on screen first (the order `analyze` uses). */
export interface HandPalm {
  /** Palm width (index to pinky knuckle) in full-frame pixels, and as the palm detector sees it. */
  framePx: number;
  detectorPx: number;
  /** The hand's length (wrist to middle fingertip) in the frame and at the detector: steadier than the palm's width when the palm turns edge-on. */
  lenPx: number;
  lenDetectorPx: number;
  /** The crop it was found in (null: the whole frame). */
  crop: string | null;
}

export interface TrackFrame {
  /** The hand result in FULL-FRAME coordinates, whatever crops were used. */
  result: GestureRecognizerResult;
  /** Pose landmarks (full frame, normalized) if pose ran and found a person. */
  pose: PoseLm[] | null;
  crops: TrackCrop[];
  hands: HandPalm[];
  /** This frame's model times, ms. */
  poseMs: number;
  gestureMs: number;
  /** A short line saying what the tracker is doing. */
  note: string;
}

const ema = (cur: number, v: number) => cur + (v - cur) * 0.1;

export class AutoTracker {
  mode: TrackMode = "off";
  /** Run pose even with the mode off, only for the counters (it costs time: Off's timing is then not the true Off). */
  measurePose = false;
  /** "image": the wrist recognizers detect from scratch on every call; "video": they track. */
  readonly wristRunning: "video" | "image";
  readonly stats = new DetectionCounter();
  /** Short running averages, ms. */
  poseMs = 0;
  gestureMs = 0;
  /** What is being loaded / why the tracker is not running yet ("" when ready). */
  loading = "";
  last: TrackFrame | null = null;
  /** Frames since the last reset, and how many of them had a different crop from the frame before (a steady crop is what keeps the recognizer's tracking valid). */
  cropFrames = 0;
  cropMoved = 0;
  private lastCropKey = "";

  private pose: PoseLandmarker | null = null;
  private poseDelegate = "";
  private wrist: Record<WristSide, GestureRecognizer | null> = { left: null, right: null };
  private wristDelegate = "";
  private personState: SmoothState = IDLE_SMOOTH;
  private wristState: Record<WristSide, SmoothState> = { left: IDLE_SMOOTH, right: IDLE_SMOOTH };
  private anchors: Record<WristSide, { x: number; y: number }> = { left: { x: 0.5, y: 0.5 }, right: { x: 0.5, y: 0.5 } };
  private readonly cropper = new Cropper();
  private readonly wristCroppers: Record<WristSide, Cropper> = { left: new Cropper(), right: new Cropper() };

  constructor(
    private readonly main: GestureRecognizer,
    wristRunning: "video" | "image" = "video",
    private readonly onChange: () => void = () => {},
  ) {
    this.wristRunning = wristRunning;
  }

  /** DEV stat: the crop draws' running average, ms (the larger of the wrist crops' when two are in use). */
  get cropMs(): number {
    return Math.max(this.cropper.avgMs, this.wristCroppers.left.avgMs, this.wristCroppers.right.avgMs);
  }

  /** Which backends loaded, for the HUD. */
  get delegates(): string {
    return [this.pose ? `pose ${this.poseDelegate}` : "", this.wrist.left ? `wrist models ${this.wristDelegate}` : ""].filter(Boolean).join(", ");
  }

  /** Start over: crops, counters. */
  reset(): void {
    this.personState = IDLE_SMOOTH;
    this.wristState = { left: IDLE_SMOOTH, right: IDLE_SMOOTH };
    this.stats.reset();
    this.cropFrames = 0;
    this.cropMoved = 0;
    this.lastCropKey = "";
    this.last = null;
  }

  /** Switches the mode and loads whatever it needs; until loaded it runs as Off. Resolves false if loading failed. */
  async setMode(mode: TrackMode): Promise<boolean> {
    this.mode = mode;
    this.reset();
    return this.load();
  }

  async load(): Promise<boolean> {
    const needPose = this.mode !== "off" || this.measurePose;
    try {
      if (needPose && !this.pose) {
        this.loading = "loading the pose model…";
        this.onChange();
        const p = await loadPose();
        this.pose = p.pose;
        this.poseDelegate = p.delegate;
      }
      if (this.mode === "wrists" && !this.wrist.left) {
        this.loading = "loading the per-hand models…";
        this.onChange();
        const [l, r] = await Promise.all([loadRecognizer(1, this.wristRunning === "image" ? "IMAGE" : "VIDEO"), loadRecognizer(1, this.wristRunning === "image" ? "IMAGE" : "VIDEO")]);
        this.wrist = { left: l.recognizer, right: r.recognizer };
        this.wristDelegate = l.delegate;
      }
      this.loading = "";
      this.onChange();
      return true;
    } catch (err) {
      console.error(err);
      this.loading = `could not load: ${err instanceof Error ? err.message : String(err)}`;
      this.mode = "off";
      this.onChange();
      return false;
    }
  }

  private get ready(): boolean {
    if (this.loading) return false;
    if (this.mode === "wrists") return !!this.pose && !!this.wrist.left && !!this.wrist.right;
    if (this.mode === "person") return !!this.pose;
    return true;
  }

  /**
   * One frame. `zoom` is the R6 zone crop, used only with the mode off. Times are measured here: the crop draws plus the
   * recognizer calls count as `gestureMs`, the pose call as `poseMs`.
   */
  run(el: HTMLVideoElement | HTMLImageElement, W: number, H: number, ts: number, zoom: CropLayout | null): TrackFrame {
    const mode: TrackMode = this.ready ? this.mode : "off";
    const poseRuns = !!this.pose && (mode !== "off" || this.measurePose);

    // 1. Pose on the full frame.
    let pose: PoseLm[] | null = null;
    let poseMs = 0;
    if (poseRuns) {
      const t0 = performance.now();
      const r = this.pose!.detectForVideo(el, ts);
      poseMs = performance.now() - t0;
      pose = r.landmarks[0] ? r.landmarks[0].map((p) => ({ x: p.x, y: p.y, visibility: p.visibility })) : null;
      this.poseMs = ema(this.poseMs, poseMs);
    }

    // 2. Crops and the hand model.
    const t1 = performance.now();
    const crops: TrackCrop[] = [];
    const hands: HandPalm[] = [];
    let result: GestureRecognizerResult;
    let note = "";
    const full = Math.max(W, H);
    const palmsOf = (res: GestureRecognizerResult, side: (i: number) => number, crop: (i: number) => string | null) => {
      res.landmarks.forEach((lm, i) => {
        const framePx = palmWidthPx(lm, W, H);
        const lenPx = handLengthPx(lm, W, H);
        hands.push({ framePx, detectorPx: atDetector(framePx, side(i)), lenPx, lenDetectorPx: atDetector(lenPx, side(i)), crop: crop(i) });
      });
    };

    if (mode === "person") {
      this.personState = smoothStep(this.personState, pose ? personCropRect(pose, W, H) : null, ts, TRACK.person.smooth, "full");
      const layout = this.personState.rect ? cropLayout(this.personState.rect, W, H) : null;
      // Nearly the whole frame: hand it over directly (the model letterboxes the same way), no copy.
      const isFull = !layout || layout.side >= 0.97 * full;
      if (isFull) {
        result = this.main.recognizeForVideo(el, ts);
        palmsOf(result, () => full, () => null);
        note = pose ? "person: full frame" : this.personState.phase === "relaxing" ? "no pose: relaxing to the full frame" : "no pose: full frame";
      } else {
        const res = this.main.recognizeForVideo(this.cropper.draw(el, layout), ts);
        result = { ...res, landmarks: res.landmarks.map((l) => mapLandmarks(l, layout)) };
        crops.push({ layout, label: "PERSON", magnification: magnification(layout) });
        palmsOf(result, () => layout.side, () => "person");
        note = pose ? "person crop" : "no pose: holding the last crop";
      }
    } else if (mode === "wrists") {
      const parts: CropResult[] = [];
      const labels: string[] = [];
      for (const side of ["left", "right"] as const) {
        const wc = pose ? wristCrop(pose, side, W, H) : null;
        this.wristState[side] = smoothStep(this.wristState[side], wc?.rect ?? null, ts, TRACK.wrist.smooth, "drop");
        if (wc) this.anchors[side] = wc.anchor;
        const rect = this.wristState[side].rect;
        if (!rect) continue;
        const layout = cropLayout(rect, W, H);
        const input = this.wristCroppers[side].draw(el, layout);
        const rec = this.wrist[side]!;
        const res = this.wristRunning === "image" ? rec.recognize(input) : rec.recognizeForVideo(input, ts);
        parts.push({ result: res, layout, anchor: this.anchors[side] });
        labels.push(side === "left" ? "L WRIST" : "R WRIST");
        crops.push({ layout, label: labels[labels.length - 1], magnification: magnification(layout) });
      }
      if (parts.length === 0) {
        result = this.main.recognizeForVideo(el, ts);
        palmsOf(result, () => full, () => null);
        note = pose ? "wrists: no wrist in view, full frame" : "no pose: full frame";
      } else {
        const merged = mergeCropResults(parts);
        result = merged.result;
        palmsOf(result, (i) => parts[merged.sources[i]].layout.side, (i) => labels[merged.sources[i]]);
        note = `${parts.length} wrist crop${parts.length > 1 ? "s" : ""}`;
      }
    } else {
      // Off: the whole frame, or the R6 zone crop.
      if (zoom) {
        const res = this.main.recognizeForVideo(this.cropper.draw(el, zoom), ts);
        result = { ...res, landmarks: res.landmarks.map((l) => mapLandmarks(l, zoom)) };
        crops.push({ layout: zoom, label: "ZOOM", magnification: magnification(zoom) });
        palmsOf(result, () => zoom.side, () => "zoom");
        note = "off (R6 zone zoom)";
      } else {
        result = this.main.recognizeForVideo(el, ts);
        palmsOf(result, () => full, () => null);
        note = "off: whole frame";
      }
    }
    const gestureMs = performance.now() - t1;
    this.gestureMs = ema(this.gestureMs, gestureMs);

    // Left-most on screen first, to line up with analyze()'s order (the display is mirrored: larger raw wrist x is further left).
    const order = result.landmarks.map((lm, i) => ({ i, x: lm[0].x })).sort((a, b) => b.x - a.x).map((o) => o.i);
    const sortedHands = order.map((i) => hands[i]);

    const key = crops.map((c) => `${c.label}:${c.layout.x0},${c.layout.y0},${c.layout.cw},${c.layout.ch}`).join("|");
    this.cropFrames++;
    if (key !== this.lastCropKey) this.cropMoved++;
    this.lastCropKey = key;
    this.stats.push({ pose: poseRuns ? pose !== null : null, wristVisible: poseRuns ? visibleWrists(pose).length > 0 : null, hand: result.landmarks.length > 0 });
    this.last = { result, pose, crops, hands: sortedHands, poseMs, gestureMs, note };
    return this.last;
  }
}
