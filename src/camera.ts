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

/** Opens the webcam in the given <video> element. */
export async function openCamera(video: HTMLVideoElement): Promise<FrameSource> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError("This browser has no camera API (or the page is not on localhost/HTTPS). Use Chrome at http://localhost.");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: APP.camera.width },
        height: { ideal: APP.camera.height },
        frameRate: { ideal: APP.camera.frameRate },
      },
    });
  } catch (err) {
    throw new CameraError(explainCameraError(err));
  }
  video.srcObject = stream;
  await video.play();
  await waitForSize(video);
  return videoSource(video);
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
