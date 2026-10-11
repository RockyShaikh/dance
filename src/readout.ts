import type { HandReading } from "./analyze";
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

/** Shape labels are shown as words: Open_Palm -> Open palm. */
function prettyShape(label: string): string {
  const s = label.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function chordHtml(h: HandReading): string {
  return CHORD_ORDER.map((k) => `<span class="f${h.chord[k] ? 1 : 0}">${k}${h.chord[k] ? 1 : 0}</span>`).join(" ");
}

function renderCard(card: HTMLElement, h: HandReading | undefined): void {
  if (!h) {
    card.classList.add("empty");
    card.innerHTML = `<div class="hand-title">No hand</div>`;
    return;
  }
  card.classList.remove("empty");
  card.innerHTML = `
    <div class="hand-title">${h.hand} hand<span class="sub">${Math.round(h.handScore * 100)}%</span></div>
    <div class="chord">${chordHtml(h)}</div>
    <div class="row"><span class="label">Shape</span>${prettyShape(h.shape)}
      <span class="score">${Math.round(h.shapeScore * 100)}%</span></div>
    <div class="row"><span class="label">Palm facing camera</span>
      <span class="${h.palmFacing ? "yes" : "no"}">${h.palmFacing ? "YES" : "NO"}</span></div>`;
}

export function renderHands(hands: readonly HandReading[]): void {
  renderCard(cards[0], hands[0]);
  renderCard(cards[1], hands[1]);
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
