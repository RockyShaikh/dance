import { describe, expect, it } from "vitest";
import { looksLikeAudio, looksLikeMedia, looksLikeVideo } from "./mediaFile";

describe("media file sniffing", () => {
  it("takes audio by type or by extension", () => {
    expect(looksLikeAudio({ name: "song.mp3", type: "" })).toBe(true);
    expect(looksLikeAudio({ name: "x", type: "audio/wav" })).toBe(true);
    expect(looksLikeAudio({ name: "clip.mp4", type: "video/mp4" })).toBe(false);
  });

  it("takes MP4, MOV, M4V and WebM video by type or by extension", () => {
    for (const name of ["a.mp4", "A.MOV", "b.m4v", "c.webm"]) expect(looksLikeVideo({ name, type: "" })).toBe(true);
    expect(looksLikeVideo({ name: "x", type: "video/quicktime" })).toBe(true);
    expect(looksLikeVideo({ name: "song.mp3", type: "audio/mpeg" })).toBe(false);
  });

  it("looksLikeMedia is either; other files are refused", () => {
    expect(looksLikeMedia({ name: "a.mp4", type: "video/mp4" })).toBe(true);
    expect(looksLikeMedia({ name: "a.flac", type: "" })).toBe(true);
    expect(looksLikeMedia({ name: "notes.txt", type: "text/plain" })).toBe(false);
    expect(looksLikeMedia({ name: "pic.png", type: "image/png" })).toBe(false);
  });
});
