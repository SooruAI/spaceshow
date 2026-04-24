import { useStore } from "../store";
import { useCursorVelocity } from "../hooks/useCursorVelocity";

/**
 * Custom cursor that replaces the hidden OS pointer during a presentation.
 *
 * - **Cursor tool**: 18px circle with `mix-blend-mode: difference`, so it
 *   automatically reads bright on dark and dark on bright backgrounds.
 *   Scales smoothly with the EMA-smoothed velocity from
 *   `useCursorVelocity`, peaking around 2.5x on a fast flick. CSS transitions
 *   soften abrupt speed changes.
 *
 * - **Torch tool**: A vibrant red dot with a soft outer glow. Normal blend
 *   mode so it stays red on every background. Doubles as a laser pointer.
 *
 * - **Pen tool**: A small crosshair-style dot that hints at the drawing tip,
 *   so the user can see exactly where a stroke will begin.
 *
 * - **Eraser tool**: A circle sized to the actual erase radius so the user
 *   sees exactly what will be affected. Solid white border in pixel mode;
 *   dashed red border in object mode to signal the destructive action.
 */
export function PresenterCursor() {
  const tool = useStore((s) => s.presentationTool);
  const eraserMode = useStore((s) => s.presentationEraserMode);
  const eraserWidth = useStore((s) => s.presentationEraserWidth);
  const { x, y, velocity, visible } = useCursorVelocity(true);

  // clamp: 0..1.5 added to the base scale (1). 2.5 px/ms is "fast".
  const extra = Math.min(1.5, Math.max(0, velocity / 2.5));
  const scale = tool === "cursor" ? 1 + extra : 1;

  const base: React.CSSProperties = {
    position: "fixed",
    left: 0,
    top: 0,
    pointerEvents: "none",
    zIndex: 9999,
    transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`,
    opacity: visible ? 1 : 0,
    transition:
      "transform 120ms ease-out, background-color 180ms, box-shadow 180ms, border-color 180ms, width 180ms, height 180ms, opacity 120ms",
    willChange: "transform",
  };

  if (tool === "torch") {
    return (
      <div
        aria-hidden
        style={{
          ...base,
          width: 18,
          height: 18,
          borderRadius: "50%",
          border: "1.5px solid rgba(255,46,63,0.9)",
          background: "#ff2e3f",
          boxShadow:
            "0 0 24px 4px rgba(255,46,63,0.55), 0 0 4px rgba(255,255,255,0.9) inset",
          mixBlendMode: "normal",
        }}
      />
    );
  }

  if (tool === "pen") {
    return (
      <div
        aria-hidden
        style={{
          ...base,
          width: 10,
          height: 10,
          borderRadius: "50%",
          border: "1.5px solid var(--accent, #0d9488)",
          background: "transparent",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.5)",
          mixBlendMode: "normal",
        }}
      />
    );
  }

  if (tool === "eraser") {
    const size = eraserMode === "object" ? 24 : eraserWidth;
    const isObject = eraserMode === "object";
    return (
      <div
        aria-hidden
        style={{
          ...base,
          width: size,
          height: size,
          borderRadius: "50%",
          border: isObject
            ? "1.5px dashed rgba(239,68,68,0.9)"
            : "1.5px solid rgba(255,255,255,0.85)",
          background: isObject
            ? "rgba(239,68,68,0.08)"
            : "rgba(255,255,255,0.08)",
          mixBlendMode: "normal",
          // No velocity-scaling — cursor size communicates the erase radius.
          transform: `translate(${x}px, ${y}px) translate(-50%, -50%)`,
        }}
      />
    );
  }

  // cursor tool (default)
  return (
    <div
      aria-hidden
      style={{
        ...base,
        width: 18,
        height: 18,
        borderRadius: "50%",
        border: "1.5px solid rgba(255,255,255,0.95)",
        background: "rgba(255,255,255,0.06)",
        mixBlendMode: "difference",
      }}
    />
  );
}
