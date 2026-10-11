import "./style.css";
import { analyze, type HandReading } from "./analyze";
import { CameraError, openCamera, openImage, openVideoFile, type FrameSource } from "./camera";
import { APP } from "./config";
import { drawHands } from "./draw";
import { loadRecognizer } from "./recognizer";
import { renderHands, setFps, setMessage, setStatus } from "./readout";

const video = document.getElementById("video") as HTMLVideoElement;
const still = document.getElementById("still") as HTMLImageElement;
const canvas = document.getElementById("overlay") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

/** Counts processed frames over a sliding window. */
class FpsMeter {
  private times: number[] = [];
  tick(now: number): number {
    this.times.push(now);
    const cutoff = now - APP.fpsWindowSec * 1000;
    while (this.times.length > 1 && this.times[0] < cutoff) this.times.shift();
    if (this.times.length < 2) return 0;
    return ((this.times.length - 1) * 1000) / (now - this.times[0]);
  }
  reset(): void {
    this.times = [];
  }
}

async function openSource(): Promise<FrameSource> {
  // Dev-only test modes, so the pipeline can be checked without a live hand:
  //   ?image=/test/hand.jpg   or   ?video=/test/hand.mp4
  const params = new URLSearchParams(location.search);
  const image = params.get("image");
  const clip = params.get("video");
  if (image) return openImage(still, image);
  if (clip) return openVideoFile(video, clip);
  return openCamera(video);
}

async function main(): Promise<void> {
  setStatus("Opening camera and loading hand model…");
  setMessage("Allow camera access when Chrome asks.");
  renderHands([]);

  let source: FrameSource;
  let loaded: Awaited<ReturnType<typeof loadRecognizer>>;
  try {
    [source, loaded] = await Promise.all([openSource(), loadRecognizer()]);
  } catch (err) {
    const text = err instanceof CameraError ? err.message : `Startup failed: ${err instanceof Error ? err.message : String(err)}`;
    setMessage(text);
    setStatus(text.split("\n")[0], true);
    console.error(err);
    return;
  }
  setMessage(null);
  setStatus(`Running (${loaded.delegate})`);

  const { recognizer } = loaded;
  const meter = new FpsMeter();
  let lastTs = -1;
  let lastVideoTime = -1;
  let latest: HandReading[] = [];

  const frame = () => {
    const { width, height } = source.size();
    if (width === 0 || height === 0) return;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    // Skip duplicate frames (the loop can run faster than the camera).
    if (source.moving && source.element instanceof HTMLVideoElement) {
      const t = source.element.currentTime;
      if (t === lastVideoTime) return;
      lastVideoTime = t;
    }
    // MediaPipe needs strictly increasing timestamps.
    let ts = performance.now();
    if (ts <= lastTs) ts = lastTs + 1;
    lastTs = ts;

    const result = recognizer.recognizeForVideo(source.element, ts);
    latest = analyze(result, width, height);
    drawHands(ctx, latest);
    renderHands(latest);
    setFps(meter.tick(ts));
    if (import.meta.env.DEV) (window as unknown as { __dance: unknown }).__dance = { hands: latest };
  };

  const loop = () => {
    try {
      frame();
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`, true);
      return; // stop the loop
    }
    schedule();
  };

  const el = source.element;
  const schedule = () => {
    if (source.moving && el instanceof HTMLVideoElement && "requestVideoFrameCallback" in el) {
      el.requestVideoFrameCallback(loop);
    } else {
      requestAnimationFrame(loop);
    }
  };
  schedule();
}

void main();
