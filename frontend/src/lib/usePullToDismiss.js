import { useCallback, useRef, useState } from "react";

/**
 * Pointer-driven pull-to-dismiss hook for modal sheets and cards.
 *
 * Tracks BOTH downward pull AND rightward swipe (back gesture).
 * Whichever exceeds `threshold` first fires `onDismiss`. Axis is locked
 * after ~10 px so the sheet doesn't jitter between axes.
 */
export function usePullToDismiss({ onDismiss, threshold = 90 } = {}) {
  const [dy, setDy] = useState(0);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, y: 0 });
  const active = useRef(false);
  const pointerId = useRef(null);
  const axisLock = useRef(null); // null | "x" | "y"

  const onPointerDown = useCallback((e) => {
    active.current = true;
    pointerId.current = e.pointerId;
    start.current = { x: e.clientX, y: e.clientY };
    axisLock.current = null;
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!active.current) return;
    const deltaX = e.clientX - start.current.x;
    const deltaY = e.clientY - start.current.y;
    if (!axisLock.current) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        axisLock.current = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
      }
    }
    if (axisLock.current === "x") {
      setDx(deltaX > 0 ? deltaX : 0);
      setDy(0);
    } else if (axisLock.current === "y") {
      setDy(deltaY > 0 ? deltaY : 0);
      setDx(0);
    }
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
      const travelled = axisLock.current === "x" ? dx : dy;
      if (travelled >= threshold) {
        onDismiss?.();
      }
      axisLock.current = null;
      setDx(0);
      setDy(0);
    },
    [dx, dy, threshold, onDismiss],
  );

  const handlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp: finish,
    onPointerCancel: finish,
    style: { touchAction: "none", cursor: dragging ? "grabbing" : "grab" },
  };

  return { handlers, dy, dx, dragging };
}
