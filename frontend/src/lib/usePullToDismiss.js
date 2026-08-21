import { useCallback, useRef, useState } from "react";

/**
 * Pointer-driven pull-to-dismiss hook for modal sheets and cards.
 * Returns handlers you spread on the drag surface + a live `translateY`
 * value (in px) to apply as an inline transform. When the user releases
 * past `threshold`, `onDismiss` fires.
 *
 * The consumer decides which node is the "drag handle" (usually the
 * top grabber pill) — tracking is scoped there so inner scroll views
 * stay scrollable.
 */
export function usePullToDismiss({ onDismiss, threshold = 90 } = {}) {
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const active = useRef(false);
  const pointerId = useRef(null);

  const onPointerDown = useCallback((e) => {
    active.current = true;
    pointerId.current = e.pointerId;
    startY.current = e.clientY;
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!active.current) return;
    const delta = e.clientY - startY.current;
    // Only allow pulling DOWN. Ignore upward drags.
    setDy(delta > 0 ? delta : 0);
  }, []);

  const finish = useCallback(
    (e) => {
      if (!active.current) return;
      active.current = false;
      setDragging(false);
      try {
        if (e && pointerId.current != null) {
          e.currentTarget.releasePointerCapture(pointerId.current);
        }
      } catch (_) {}
      pointerId.current = null;
      if (dy >= threshold) {
        onDismiss?.();
      }
      setDy(0);
    },
    [dy, threshold, onDismiss],
  );

  const handlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp: finish,
    onPointerCancel: finish,
    style: { touchAction: "none", cursor: dragging ? "grabbing" : "grab" },
  };

  return { handlers, dy, dragging };
}
