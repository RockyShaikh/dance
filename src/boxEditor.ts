import { applyDrag, cursorFor, pickBox, type Box, type Handle, type Vec2 } from "./box";
import { BOX } from "./config";
import type { Handedness } from "./hand";

export interface BoxEditor {
  /** The box and handle under the pointer (or being dragged), for the HUD to highlight. */
  readonly active: { hand: Handedness; handle: Handle } | null;
  readonly dragging: boolean;
}

/**
 * Mouse editing of the command boxes on the HUD canvas (R4b: one per hand): drag inside a box to move
 * it, drag an edge or corner to resize. The HUD canvas is not mirrored, so a pointer position maps
 * straight to display-normalized coordinates, the same space the boxes use. Every change goes through
 * `setBox` right away.
 */
export function attachBoxEditor(
  canvas: HTMLCanvasElement,
  getBoxes: () => Record<Handedness, Box>,
  setBox: (hand: Handedness, b: Box) => void,
  onChange: () => void,
): BoxEditor {
  let hover: { hand: Handedness; handle: Handle } | null = null;
  let drag: { hand: Handedness; handle: Handle; start: Box; from: Vec2; id: number } | null = null;

  const pos = (e: PointerEvent): { p: Vec2; tol: Vec2 } => {
    const r = canvas.getBoundingClientRect();
    return {
      p: { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height },
      tol: { x: BOX.grabPx / r.width, y: BOX.grabPx / r.height },
    };
  };
  const hit = (e: PointerEvent) => {
    const { p, tol } = pos(e);
    const h = pickBox(getBoxes(), p, tol);
    return h ? { hand: h.key, handle: h.handle } : null;
  };

  canvas.addEventListener("pointerdown", (e) => {
    const h = hit(e);
    if (!h) return;
    drag = { ...h, start: { ...getBoxes()[h.hand] }, from: pos(e).p, id: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = cursorFor(h.handle);
    e.preventDefault();
    onChange();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (drag) {
      const { p } = pos(e);
      setBox(drag.hand, applyDrag(drag.start, drag.handle, p.x - drag.from.x, p.y - drag.from.y));
    } else {
      hover = hit(e);
      canvas.style.cursor = cursorFor(hover?.handle ?? null);
    }
    onChange();
  });

  const end = (e: PointerEvent): void => {
    if (!drag) return;
    if (canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
    drag = null;
    hover = hit(e);
    canvas.style.cursor = cursorFor(hover?.handle ?? null);
    onChange();
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("pointerleave", () => {
    if (!drag) {
      hover = null;
      onChange();
    }
  });

  return {
    get active() {
      return drag ? { hand: drag.hand, handle: drag.handle } : hover;
    },
    get dragging() {
      return drag !== null;
    },
  };
}
