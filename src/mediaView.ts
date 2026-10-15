/**
 * R9: the two switches for the video stage: mirror the practice video (CSS only) and show / hide the small camera view.
 * DOM only; the values live in `Settings` (settings.ts, persisted).
 */
import type { Settings } from "./settings";

export function bindMediaView(settings: Pick<Settings, "mirrorVideo" | "showCamera">, save: () => void): void {
  const media = document.getElementById("media")!;
  const mirror = document.getElementById("mirror-video") as HTMLInputElement;
  const camera = document.getElementById("show-camera") as HTMLInputElement;
  const apply = () => {
    media.dataset.mirrored = settings.mirrorVideo ? "1" : "0";
    document.body.classList.toggle("camera-hidden", !settings.showCamera);
  };
  mirror.checked = settings.mirrorVideo;
  camera.checked = settings.showCamera;
  apply();
  mirror.addEventListener("change", () => {
    settings.mirrorVideo = mirror.checked;
    save();
    apply();
    mirror.blur(); // so a later Space press is the play/pause shortcut, not a click on this box
  });
  camera.addEventListener("change", () => {
    settings.showCamera = camera.checked;
    save();
    apply();
    camera.blur();
  });
}
