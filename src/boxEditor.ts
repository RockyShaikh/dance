import { applyDrag, cursorFor, hitTest, type Box, type Handle, type Vec2 } from "./box";
import { BOX } from "./config";

export interface BoxEditor {
  /** The handle under the pointer (or being dragged), for the HUD to highlight. */
  readonly active: Handle | null;
  readonly dragging: boolean;
}

/**
 * Mouse editing of the command box on the HUD canvas: drag inside to move, drag an
 * edge or corner to resize. The HUD canvas is not mirrored, so a pointer position
 * maps straight to display-normalized coordinates, the same space the box uses.
 * Every change goes through `setBox` right away.
 */
export function attachBoxEditor(
  canvas: HTMLCanvasElement,
  getBox: () => Box,
  setBox: (b: Box) => void,
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

  canvas.addEventListener("pointerdown", (e) => {
    const { p, tol } = pos(e);
    const handle = hitTest(getBox(), p, tol);
    if (!handle) return;
    drag = { handle, start: getBox(), from: p, id: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = cursorFor(handle);
    e.preventDefault();
    onChange();
  });

  canvas.addEventListener("pointermove", (e) => {
    const { p, tol } = pos(e);
    if (drag) {
      setBox(applyDrag(drag.start, drag.handle, p.x - drag.from.x, p.y - drag.from.y));
    } else {
      hover = hitTest(getBox(), p, tol);
      canvas.style.cursor = cursorFor(hover);
    }
    onChange();
  });

  const end = (e: PointerEvent): void => {
    if (!drag) return;
    if (canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
    drag = null;
    hover = hitTest(getBox(), pos(e).p, pos(e).tol);
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
