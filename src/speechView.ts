/** R9: the Voice switch and volume slider. DOM only; the values live in `Settings` (settings.ts, persisted). */
import type { Settings } from "./settings";
import type { Speaker } from "./speech";

export function bindSpeechView(settings: Pick<Settings, "speech" | "speechVolume">, save: () => void, speaker: Speaker): void {
  const on = document.getElementById("speech-on") as HTMLInputElement;
  const volume = document.getElementById("speech-volume") as HTMLInputElement;
  const apply = () => {
    volume.disabled = !settings.speech;
  };
  on.checked = settings.speech;
  volume.value = String(settings.speechVolume);
  apply();
  on.addEventListener("change", () => {
    settings.speech = on.checked;
    save();
    apply();
    if (!settings.speech) speaker.cancelSettle();
    on.blur(); // so a later Space press is the play/pause shortcut, not a click on this box
  });
  volume.addEventListener("input", () => {
    settings.speechVolume = Number(volume.value);
    save();
  });
  // Letting go of the slider says a sample word at the new volume.
  volume.addEventListener("change", () => {
    speaker.sample();
    volume.blur();
  });
}
