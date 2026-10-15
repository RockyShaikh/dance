import { applyDrag, cursorFor, hitTest, type Box, type Handle, type Vec2 } from "./box";
import { BOX } from "./config";

export interface BoxEditor {
  /** The handle of the zone under the pointer (or being dragged), for the HUD to highlight. */
  readonly active: Handle | null;
  readonly dragging: boolean;
}

/**
 * Mouse editing of the command zone on the HUD canvas (R6: one shared zone): drag inside it to move
 * it, drag an edge or corner to resize. The HUD canvas is not mirrored, so a pointer position maps
 * straight to display-normalized coordinates, the same space the boxes use. Every change goes through
 * `setBox` right away.
 */
export function attachBoxEditor(
  canvas: HTMLCanvasElement,
  getZone: () => Box,
  setZone: (b: Box) => void,
  onChange: () => void,
): BoxEditor {
  let hover: Handle | null = null;
  let drag: { handle: Handle; start: Box; from: Vec2; id: number } | null = null;

  const pos = (e: PointerEvent): { p: Vec2; tol: Vec2 } => {
    const r = canvas.getBoundingClientRect();
    return {
      p: { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height },
      tol: { x: BOX.grabPx / r.width, y: BOX.grabPx / r.height },
    };
  };
  const hit = (e: PointerEvent): Handle | null => {
    const { p, tol } = pos(e);
    return hitTest(getZone(), p, tol);
  };

  canvas.addEventListener("pointerdown", (e) => {
    const h = hit(e);
    if (!h) return;
    drag = { handle: h, start: { ...getZone() }, from: pos(e).p, id: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = cursorFor(h);
    e.preventDefault();
    onChange();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (drag) {
      const { p } = pos(e);
      setZone(applyDrag(drag.start, drag.handle, p.x - drag.from.x, p.y - drag.from.y));
    } else {
      hover = hit(e);
      canvas.style.cursor = cursorFor(hover);
    }
    onChange();
  });

  const end = (e: PointerEvent): void => {
    if (!drag) return;
    if (canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
    drag = null;
    hover = hit(e);
    canvas.style.cursor = cursorFor(hover);
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
      return drag ? drag.handle : hover;
    },
    get dragging() {
      return drag !== null;
    },
  };
}
