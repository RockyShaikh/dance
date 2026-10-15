import { FilesetResolver, GestureRecognizer, PoseLandmarker } from "@mediapipe/tasks-vision";
import { APP, TRACK } from "./config";

export interface LoadedRecognizer {
  recognizer: GestureRecognizer;
  /** Which backend actually got used. */
  delegate: "GPU" | "CPU";
}

type Delegate = "GPU" | "CPU";

/** The WASM runtime, resolved once and shared by every task. */
let visionPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;
function vision() {
  return (visionPromise ??= FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}${APP.wasmPath}`));
}

/** Tries the GPU first and falls back to the CPU if the GPU delegate can't start. */
async function withFallback<T>(make: (delegate: Delegate) => Promise<T>, what: string): Promise<{ task: T; delegate: Delegate }> {
  try {
    return { task: await make("GPU"), delegate: "GPU" };
  } catch (err) {
    console.warn(`${what}: GPU delegate failed, falling back to CPU:`, err);
    return { task: await make("CPU"), delegate: "CPU" };
  }
}

/**
 * Loads the MediaPipe Gesture Recognizer (it tracks hands between frames in VIDEO mode, which is faster and steadier than
 * detecting from scratch every frame; IMAGE mode detects from scratch on every call and keeps no state). R8's per-wrist
 * recognizers use `numHands` 1: a tracked hand then skips the palm detector entirely.
 */
export async function loadRecognizer(numHands: number = APP.numHands, runningMode: "VIDEO" | "IMAGE" = "VIDEO"): Promise<LoadedRecognizer> {
  const base = import.meta.env.BASE_URL;
  const fileset = await vision();
  const { task, delegate } = await withFallback(
    (d) =>
      GestureRecognizer.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${base}${APP.modelPath}`, delegate: d },
        runningMode,
        numHands,
      }),
    "Gesture Recognizer",
  );
  return { recognizer: task, delegate };
}

/** R8: the Pose Landmarker (lite, VIDEO mode, one person), run on the full frame to say where to crop. */
export async function loadPose(): Promise<{ pose: PoseLandmarker; delegate: Delegate }> {
  const base = import.meta.env.BASE_URL;
  const fileset = await vision();
  const { task, delegate } = await withFallback(
    (d) =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${base}${TRACK.poseModelPath}`, delegate: d },
        runningMode: "VIDEO",
        numPoses: 1,
      }),
    "Pose Landmarker",
  );
  return { pose: task, delegate };
}
