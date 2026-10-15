// Makes a 60 s synthetic test video in the git-ignored public/test/ (never commit media): ffmpeg's `testsrc` (it burns a running
// timecode and a frame counter into the picture, and the picture is asymmetric, so mirroring is obvious) plus a short beep twice a
// second (so the timeline waveform has something to show). Needs ffmpeg (`brew install ffmpeg`).
//
//   node scripts/make-test-video.mjs [seconds]      -> public/test/test-video.mp4
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const seconds = Number(process.argv[2] ?? 60);
mkdirSync("public/test", { recursive: true });
execFileSync(
  "ffmpeg",
  [
    "-y", "-loglevel", "error",
    "-f", "lavfi", "-i", `testsrc=size=1280x720:rate=30:duration=${seconds}`,
    "-f", "lavfi", "-i", `aevalsrc=sin(2*PI*660*t)*lt(mod(t\\,0.5)\\,0.08):s=44100:d=${seconds}`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "15", "-c:a", "aac", "-b:a", "96k", "-shortest",
    "public/test/test-video.mp4",
  ],
  { stdio: "inherit" },
);
console.log(`wrote public/test/test-video.mp4 (${seconds} s)`);
