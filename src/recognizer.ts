import { FilesetResolver, GestureRecognizer } from "@mediapipe/tasks-vision";
import { APP } from "./config";

export interface LoadedRecognizer {
  recognizer: GestureRecognizer;
  /** Which backend actually got used. */
  delegate: "GPU" | "CPU";
}

/**
 * Loads the MediaPipe Gesture Recognizer in VIDEO mode (it tracks hands between
 * frames, which is faster and steadier than detecting from scratch every frame).
 * Tries the GPU first and falls back to the CPU if the GPU delegate can't start.
 */
export async function loadRecognizer(): Promise<LoadedRecognizer> {
  const base = import.meta.env.BASE_URL;
  const vision = await FilesetResolver.forVisionTasks(`${base}${APP.wasmPath}`);

  const make = (delegate: "GPU" | "CPU") =>
    GestureRecognizer.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `${base}${APP.modelPath}`,
        delegate,
      },
      runningMode: "VIDEO",
      numHands: APP.numHands,
    });

  try {
    return { recognizer: await make("GPU"), delegate: "GPU" };
  } catch (err) {
    console.warn("GPU delegate failed, falling back to CPU:", err);
    return { recognizer: await make("CPU"), delegate: "CPU" };
  }
}
