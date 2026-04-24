import { useEffect, useRef, useState } from "react";

export interface CursorVelocityState {
  x: number;
  y: number;
  /** EMA-smoothed speed, px per millisecond. */
  velocity: number;
  /** False while the pointer is outside the viewport. */
  visible: boolean;
}

/**
 * Subscribes to pointer events on `window`, sampling position inside a
 * requestAnimationFrame loop so state updates stay in sync with the browser's
 * render cadence. Raw instantaneous velocity (Δdistance / Δt) is fed into an
 * exponential moving average so the cursor doesn't jitter on every micro
 * movement — `velocity = 0.7 * prev + 0.3 * instant`.
 *
 * Returns the latest `{x, y, velocity, visible}` snapshot. Consumers read
 * `velocity` to scale the custom cursor and the state object is referentially
 * new on each rAF tick so React re-renders the cursor only when it actually
 * moves.
 */
export function useCursorVelocity(enabled = true): CursorVelocityState {
  const [state, setState] = useState<CursorVelocityState>({
    x: 0,
    y: 0,
    velocity: 0,
    visible: false,
  });

  // Refs held outside React state so the rAF loop can mutate without forcing
  // unnecessary re-renders on every frame.
  const posRef = useRef<{ x: number; y: number; t: number }>({
    x: 0,
    y: 0,
    t: 0,
  });
  const lastPosRef = useRef<{ x: number; y: number; t: number }>({
    x: 0,
    y: 0,
    t: 0,
  });
  const velRef = useRef<number>(0);
  const visibleRef = useRef<boolean>(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    function onMove(e: PointerEvent) {
      posRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (!visibleRef.current) {
        visibleRef.current = true;
      }
    }
    function onLeave() {
      visibleRef.current = false;
    }
    function onEnter() {
      visibleRef.current = true;
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerenter", onEnter);
    window.addEventListener("pointerleave", onLeave);
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseenter", onEnter);

    function tick() {
      const now = performance.now();
      const p = posRef.current;
      const last = lastPosRef.current;
      const dt = Math.max(1, now - last.t);
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      const instant = Math.sqrt(dx * dx + dy * dy) / dt;
      // Exponential moving average — high weight on history keeps the scale
      // response smooth; 0.3 gain on "instant" is enough to react to flicks.
      velRef.current = velRef.current * 0.7 + instant * 0.3;

      // Decay velocity when the pointer stops moving.
      if (now - p.t > 60) {
        velRef.current *= 0.85;
      }

      lastPosRef.current = { x: p.x, y: p.y, t: now };

      setState({
        x: p.x,
        y: p.y,
        velocity: velRef.current,
        visible: visibleRef.current,
      });
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerenter", onEnter);
      window.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseenter", onEnter);
    };
  }, [enabled]);

  return state;
}
