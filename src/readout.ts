import type { HandReading } from "./analyze";
import { contains, type Box } from "./box";
import type { Handedness } from "./hand";
import { prettyShape } from "./hud";
import { CHORD_ORDER } from "./pseudoChord";

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node;
}

const cards = [el("hand-0"), el("hand-1")];
const fpsValue = el("fps-value");
const statusEl = el("status");
const messageEl = el("message");

function chordHtml(h: HandReading): string {
  return CHORD_ORDER.map((k) => `<span class="f${h.chord[k] ? 1 : 0}">${k}${h.chord[k] ? 1 : 0}</span>`).join(" ");
}

function renderCard(card: HTMLElement, h: HandReading | undefined, box: Box): void {
  if (!h) {
    card.classList.add("empty");
    card.innerHTML = `<div class="hand-title">No hand</div>`;
    return;
  }
  card.classList.remove("empty");
  const inBox = contains(box, h.palm);
  card.innerHTML = `
    <div class="hand-title">${h.hand} hand<span class="sub">${Math.round(h.handScore * 100)}%</span></div>
    <div class="chord">${chordHtml(h)}</div>
    <div class="row"><span class="label">Shape</span>${prettyShape(h.shape)}
      <span class="score">${Math.round(h.shapeScore * 100)}%</span></div>
    <div class="row two">
      <div><span class="label">Palm facing camera</span>
        <span class="${h.palmFacing ? "yes" : "no"}">${h.palmFacing ? "YES" : "NO"}</span></div>
      <div><span class="label">Palm centre in its box</span>
        <span class="${inBox ? "yes" : "no"}">${inBox ? "YES" : "NO"}</span></div>
    </div>
    <div class="row tiny"><span class="score">pinch gap ${h.pinchRatio.toFixed(2)} · finger reach ${h.clawExt.toFixed(2)}</span></div>`;
}

export function renderHands(hands: readonly HandReading[], boxes: Record<Handedness, Box>): void {
  renderCard(cards[0], hands[0], hands[0] ? boxes[hands[0].hand] : boxes.Right);
  renderCard(cards[1], hands[1], hands[1] ? boxes[hands[1].hand] : boxes.Right);
}

export function setFps(fps: number | null): void {
  fpsValue.textContent = fps === null ? "--" : String(Math.round(fps));
}

export function setStatus(text: string, isError = false): void {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

/** A big centred message over the video area; pass null to hide it. */
export function setMessage(text: string | null): void {
  messageEl.hidden = text === null;
  messageEl.textContent = text ?? "";
}
