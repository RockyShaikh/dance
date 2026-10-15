import { videoConstraints, type CameraDevice, type PictureShape } from "./cameraSelect";
import { APP } from "./config";

/** Something the recognizer can read frames from, plus its pixel size. */
export interface FrameSource {
  element: HTMLVideoElement | HTMLImageElement;
  /** True for a live or looping video, false for a single still image. */
  moving: boolean;
  size(): { width: number; height: number };
}

export class CameraError extends Error {}

function explainCameraError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return (
        "Camera access was blocked.\n" +
        "Click the camera icon at the right of Chrome's address bar, choose Allow, then reload.\n" +
        "(macOS: also check System Settings > Privacy & Security > Camera > Google Chrome.)"
      );
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found. Plug one in (or enable your webcam) and reload.";
    case "NotReadableError":
    case "AbortError":
      return "The camera is busy or unavailable. Close other apps using it (Zoom, Meet, Photo Booth) and reload.";
    default:
      return `Could not open the camera: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** The requested picture for a shape (APP.camera holds the one value to change). */
export function requestedSize(shape: PictureShape = "16:9"): { width: number; height: number } {
  return shape === "4:3" ? APP.camera.requested43 : APP.camera.requested;
}

/** Opens a camera (the browser's default when `deviceId` is null) in the given <video> element, at the requested picture size. */
export async function openCamera(video: HTMLVideoElement, deviceId: string | null = null, shape: PictureShape = "16:9"): Promise<FrameSource> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError("This browser has no camera API (or the page is not on localhost/HTTPS). Use Chrome at http://localhost.");
  }
  stopCamera(video);
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints(deviceId, requestedSize(shape), APP.camera.frameRate) });
  } catch (err) {
    throw new CameraError(explainCameraError(err));
  }
  video.srcObject = stream;
  await video.play();
  await waitForSize(video);
  return videoSource(video);
}

/** Stops the camera currently in the element (so the next one can be opened, and the camera light goes off). */
export function stopCamera(video: HTMLVideoElement): void {
  const s = video.srcObject;
  if (s instanceof MediaStream) for (const t of s.getTracks()) t.stop();
  video.srcObject = null;
}

/** The camera video inputs. Labels are empty until the page has had camera permission. */
export async function listCameras(): Promise<CameraDevice[]> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === "videoinput").map((d) => ({ deviceId: d.deviceId, label: d.label }));
  } catch {
    return [];
  }
}

/** What the open camera really delivers, per its track and per the <video> (the pixels that arrive). */
export interface Delivered {
  deviceId: string | null;
  label: string;
  width: number;
  height: number;
  /** The track's nominal frame rate (null if the browser does not say). */
  frameRate: number | null;
  live: boolean;
}

export function deliveredOf(video: HTMLVideoElement): Delivered | null {
  const track = video.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks()[0] : undefined;
  if (!track) return null;
  const st = track.getSettings();
  return {
    deviceId: st.deviceId ?? null,
    label: track.label,
    width: video.videoWidth || st.width || 0,
    height: video.videoHeight || st.height || 0,
    frameRate: st.frameRate ?? null,
    live: track.readyState === "live",
  };
}

/** Dev-only test mode: play a video file in a loop instead of the camera (?video=URL). */
export async function openVideoFile(video: HTMLVideoElement, url: string): Promise<FrameSource> {
  video.src = url;
  video.loop = true;
  video.muted = true;
  await video.play();
  await waitForSize(video);
  return videoSource(video);
}

/** Dev-only test mode: use a still image instead of the camera (?image=URL). */
export async function openImage(img: HTMLImageElement, url: string): Promise<FrameSource> {
  img.hidden = false;
  document.getElementById("video")?.setAttribute("hidden", "");
  img.src = url;
  await img.decode();
  return {
    element: img,
    moving: false,
    size: () => ({ width: img.naturalWidth, height: img.naturalHeight }),
  };
}

function videoSource(video: HTMLVideoElement): FrameSource {
  return {
    element: video,
    moving: true,
    size: () => ({ width: video.videoWidth, height: video.videoHeight }),
  };
}

async function waitForSize(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth > 0) return;
  await new Promise<void>((resolve) => {
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
  });
}
