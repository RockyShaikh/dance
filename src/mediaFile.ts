/** Which dropped / picked files the player takes (R9: audio, and video with its picture). Pure. */

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac)$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|ogv)$/i;

type FileLike = { name: string; type: string };

export function looksLikeAudio(file: FileLike): boolean {
  return file.type.startsWith("audio/") || AUDIO_EXT.test(file.name);
}

export function looksLikeVideo(file: FileLike): boolean {
  return file.type.startsWith("video/") || VIDEO_EXT.test(file.name);
}

/** Audio or video: what the picker and drag-and-drop accept. */
export function looksLikeMedia(file: FileLike): boolean {
  return looksLikeAudio(file) || looksLikeVideo(file);
}

/** The picker's `accept` list. */
export const MEDIA_ACCEPT = "audio/*,video/*,.mp3,.wav,.m4a,.ogg,.flac,.mp4,.m4v,.mov,.webm";
