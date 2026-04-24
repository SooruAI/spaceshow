import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Group, Rect } from "react-konva";
import { useStore } from "../store";
import { usePresenterKeys } from "../hooks/usePresenterKeys";
import { PresenterShape } from "./PresenterShape";
import { PresenterControls, PRESENTER_BAR_HEIGHT } from "./PresenterControls";
import { PresenterCursor } from "./PresenterCursor";
import { PresenterToolSettings } from "./PresenterToolSettings";

// Stroke types — hoisted above PresenterView because PresenterView owns the
// per-sheet stroke map (so navigating between slides doesn't lose drawings).
// PenOverlay further down uses the same types for its local refs.
type Pt = { x: number; y: number };
type Stroke =
  | { type: "pen"; points: Pt[]; color: string; width: number; opacity: number }
  | { type: "erase"; points: Pt[]; width: number };

/**
 * The fullscreen presenter view. Responsibilities:
 *   1. Compute a fit-scale for the current sheet so it sits centered with a
 *      comfortable margin.
 *   2. Render the Konva stage + in-sheet shapes via <PresenterShape />.
 *   3. Render an HTML `<canvas>` overlay for transient pen strokes (cleared
 *      when the slide changes or presentation quits).
 *   4. Handle zone-clicks (left 25% = prev, rest = next).
 *   5. Attach capture-phase keyboard handlers via `usePresenterKeys`.
 *   6. Play a 320ms shake when the viewer tries to go back from slide 1.
 *   7. Fade-from-black on mount, fade-to-black on quit.
 *   8. Mount a custom cursor that hides the OS pointer.
 */
export function PresenterView() {
  const status = useStore((s) => s.presentationStatus);
  const tool = useStore((s) => s.presentationTool);
  const penColor = useStore((s) => s.presentationPenColor);
  const penWeight = useStore((s) => s.presentationPenWeight);
  const penOpacity = useStore((s) => s.presentationPenOpacity);
  const eraserMode = useStore((s) => s.presentationEraserMode);
  const eraserWidth = useStore((s) => s.presentationEraserWidth);
  // Monotonic "clear" signal from the bottom bar. Folded into PenOverlay's
  // `key` below — each bump remounts the overlay so it re-reads the
  // (now-pruned) per-sheet stroke map and starts from an empty canvas.
  const clearNonce = useStore((s) => s.presentationClearNonce);
  const clearPresentationStrokes = useStore((s) => s.clearPresentationStrokes);

  // Per-sheet stroke store, keyed by sheetId. Lives in a ref so mid-stroke
  // mutations don't trigger re-renders, but survives PenOverlay remounts
  // (which happen on every slide change) — so drawing on sheet A, flipping
  // to sheet B, then flipping back to A still shows A's original ink.
  // Scope is the entire presentation session: the ref (and the Map it
  // holds) die with PresenterView on quit, which starts the next session
  // from a clean slate.
  const strokesBySheetRef = useRef<Map<string, Stroke[]>>(new Map());
  const selectedIds = useStore((s) => s.presentationSelectedIds);
  const index = useStore((s) => s.presentationIndex);
  const sheets = useStore((s) => s.sheets);
  const allShapes = useStore((s) => s.shapes);
  const nextSlide = useStore((s) => s.nextSlide);
  const prevSlide = useStore((s) => s.prevSlide);
  const quitPresentation = useStore((s) => s.quitPresentation);

  // Validate selection against the current sheets list — if a sheet was
  // deleted mid-presentation, drop it. Empty list → quit.
  const validIds = useMemo(
    () => selectedIds.filter((id) => sheets.some((s) => s.id === id)),
    [selectedIds, sheets],
  );
  const safeIndex = Math.max(0, Math.min(index, validIds.length - 1));
  const currentSheetId = validIds[safeIndex];
  const currentSheet = sheets.find((s) => s.id === currentSheetId) ?? null;

  useEffect(() => {
    if (validIds.length === 0) quitPresentation();
  }, [validIds.length, quitPresentation]);

  const [viewport, setViewport] = useState({
    w: typeof window !== "undefined" ? window.innerWidth : 1200,
    h: typeof window !== "undefined" ? window.innerHeight : 800,
  });

  useEffect(() => {
    function onResize() {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Device fullscreen. Request right after mount — the click that
  // transitioned us into "presenting" is still inside the browser's
  // transient-activation window, so the call succeeds without a prompt.
  // If the user exits fullscreen through F11 / Esc / browser UI we mirror
  // that into a quit so the in-app presentation state stays in sync with
  // what the physical screen is showing. Uses optional-chain + webkit-
  // prefixed fallbacks to cover Safari; failures are swallowed so a
  // denied permission never breaks the presenter — it just keeps
  // running inside the browser window.
  //
  // Keyboard Lock (Chrome/Edge only): once fullscreen is engaged we ask
  // the browser to deliver Esc to our keydown handler instead of using
  // it to exit fullscreen. That enables progressive Esc (first Esc
  // cancels the active tool, second Esc quits — see usePresenterKeys).
  // In Safari / Firefox `navigator.keyboard` is undefined, so the lock
  // silently no-ops and Esc continues to exit fullscreen → quit — which
  // still matches what a presenter intuitively expects.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    type FSDoc = {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void>;
    };
    type FSEl = {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    type KBNav = {
      keyboard?: {
        lock?: (keys?: string[]) => Promise<void>;
        unlock?: () => void;
      };
    };
    const fsEl = () =>
      document.fullscreenElement ??
      (document as unknown as FSDoc).webkitFullscreenElement ??
      null;

    async function tryLockEscape() {
      const kb = (navigator as unknown as KBNav).keyboard;
      if (!kb?.lock) return;
      try {
        await kb.lock(["Escape"]);
      } catch {
        /* lock denied — fall back to browser's native Esc-exits-fullscreen. */
      }
    }

    if (!fsEl()) {
      const req =
        el.requestFullscreen?.() ??
        (el as unknown as FSEl).webkitRequestFullscreen?.();
      Promise.resolve(req)
        .then(() => tryLockEscape())
        .catch(() => {
          /* user or browser denied — continue without device fullscreen. */
        });
    } else {
      // Already fullscreen somehow — still attempt the lock.
      tryLockEscape();
    }

    function onChange() {
      // Only respond to *external* exits. Our own unmount-exit below
      // happens after this listener is removed, so it never re-enters.
      if (!fsEl()) triggerQuit();
    }
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener(
      "webkitfullscreenchange",
      onChange as EventListener,
    );

    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        onChange as EventListener,
      );
      const kb = (navigator as unknown as KBNav).keyboard;
      kb?.unlock?.();
      if (fsEl()) {
        const exit =
          document.exitFullscreen?.() ??
          (document as unknown as FSDoc).webkitExitFullscreen?.();
        Promise.resolve(exit).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shake trigger: we `key` the stage wrapper with this number so React
  // replays the CSS animation on every rejected prev attempt.
  const [shakeKey, setShakeKey] = useState(0);
  // Exit fade: when true, render a black overlay fading in, then actually
  // call quitPresentation() after 160ms so the fade can finish.
  const [exiting, setExiting] = useState(false);

  // Root element ref — target for `requestFullscreen`. Keeping fullscreen
  // scoped to the presenter root (rather than document.documentElement)
  // means a browser UI layer like a password prompt can still surface
  // above it cleanly.
  const rootRef = useRef<HTMLDivElement | null>(null);
  // Guards triggerQuit against the double-call race between the Esc key
  // (routed through usePresenterKeys) and the browser-fired
  // fullscreenchange that Esc also triggers. The `exiting` state can
  // lag a render, so we use a ref for a synchronous one-shot.
  const quitScheduledRef = useRef(false);

  function triggerQuit() {
    if (quitScheduledRef.current) return;
    quitScheduledRef.current = true;
    setExiting(true);
    window.setTimeout(() => quitPresentation(), 160);
  }

  function handleNext() {
    // On the last slide, "next" exits the presentation directly — skipping
    // the end-of-present overlay so a presenter who clicks past the final
    // slide lands back in the editor without an extra dismiss step.
    if (safeIndex >= validIds.length - 1) {
      triggerQuit();
      return;
    }
    nextSlide();
  }
  function handlePrev() {
    const res = prevSlide();
    if (res === "blocked") {
      setShakeKey((k) => k + 1);
    }
  }
  // "Clear all" scoped to the current slide: drop this sheet's entry from
  // the per-sheet map FIRST, then bump the nonce so PenOverlay remounts.
  // Order matters — the new overlay reads the map at mount time and will
  // only see an empty slot if we deleted before the remount. Other sheets'
  // strokes are untouched.
  function handleClearCurrentSheet() {
    if (!currentSheet) return;
    strokesBySheetRef.current.delete(currentSheet.id);
    clearPresentationStrokes();
  }

  usePresenterKeys({
    onNext: handleNext,
    onPrev: handlePrev,
    onQuit: triggerQuit,
  });

  // Fit math — cinema-wide fit above the bottom control bar. The bar is now
  // an opaque docked surface (not a translucent float), so we subtract its
  // height from the vertical budget to keep the entire sheet visible above
  // it. Width is edge-to-edge; letterboxes in raw black when the sheet
  // aspect doesn't match the viewport's usable rectangle.
  const margin = 0;
  const availW = Math.max(100, viewport.w - margin);
  const availH = Math.max(100, viewport.h - margin - PRESENTER_BAR_HEIGHT);
  const sheet = currentSheet;
  const scale = sheet
    ? Math.min(availW / sheet.width, availH / sheet.height)
    : 1;
  const stageW = sheet ? sheet.width * scale : 0;
  const stageH = sheet ? sheet.height * scale : 0;

  // Click zone — left 25% prev, rest next. Only active in cursor mode.
  // Pen/eraser clicks already get eaten by the PenOverlay canvas above this
  // layer; torch has no overlay, so we have to gate it explicitly — otherwise
  // every "spotlight" click also skips a slide. Guarding on "any non-cursor
  // tool" is both the simplest rule and future-proofs new tools from needing
  // their own opt-out.
  function handleZoneClick(e: React.MouseEvent<HTMLDivElement>) {
    if (tool !== "cursor") return;
    const x = e.clientX;
    const frac = x / window.innerWidth;
    if (frac < 0.25) handlePrev();
    else handleNext();
  }

  if (status !== "presenting") return null;
  if (!sheet) return null;

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden animate-fade-in"
      style={{
        cursor: "none",
        background: "#000",
        // Reserve the opaque control bar's footprint so `items-center`
        // centers the sheet within the *visible* region above the bar.
        // Without this the sheet centers in the full viewport, which
        // hides its bottom behind the bar.
        paddingBottom: PRESENTER_BAR_HEIGHT,
      }}
    >
      {/* Click zone (behind content, above fade layer). */}
      <div
        className="absolute inset-0 z-[5]"
        onClick={handleZoneClick}
        aria-hidden
      />

      {/* The sheet wrapper. Keyed by `shakeKey` so the animation restarts on
          every rejected prev attempt. Keyed also by safeIndex so the slide
          crossfade plays on navigation. */}
      <div
        key={`${safeIndex}-${shakeKey}`}
        className="relative animate-fade-in"
        style={{
          width: stageW,
          height: stageH,
          animation: shakeKey > 0 ? "shake 320ms ease-in-out" : undefined,
        }}
      >
        {/* Visible sheet background — edge-to-edge cinema fit (no rounded
            corners, no drop shadow). The sheet IS the slide. */}
        <div
          className="absolute inset-0"
          style={{ background: sheet.background }}
        >
          <Stage width={stageW} height={stageH} listening={false}>
            <Layer listening={false}>
              <Group scaleX={scale} scaleY={scale}>
                {allShapes
                  .filter((s) => s.sheetId === sheet.id && s.visible)
                  .map((s) => (
                    <PresenterShape key={s.id} shape={s} />
                  ))}
              </Group>
            </Layer>
          </Stage>
        </div>

        {/* Pen overlay — separate HTML canvas on top so strokes stay crisp
            at screen resolution regardless of sheet scale. Receives pointer
            events whenever the pen OR eraser tool is active. */}
        <PenOverlay
          // Key on sheetId (not safeIndex) so moving between slides
          // remounts the canvas — the overlay then re-reads the map and
          // picks up that sheet's saved strokes. `clearNonce` forces a
          // remount when the user clears the same sheet they're on.
          key={`pen-${sheet.id}-${clearNonce}`}
          sheetId={sheet.id}
          strokesMap={strokesBySheetRef.current}
          width={stageW}
          height={stageH}
          tool={tool}
          color={penColor}
          weight={penWeight}
          opacity={penOpacity}
          eraserMode={eraserMode}
          eraserWidth={eraserWidth}
        />
      </div>

      {/* Pen / eraser settings popover — mounted here (not inside
          PresenterControls) so its fade-in animation replays independent
          of the control-bar and so React fragments stay out of
          PresenterControls. Positions itself at bottom-[80px], above the
          control bar. */}
      <PresenterToolSettings />

      <PresenterControls
        total={validIds.length}
        index={safeIndex}
        sheet={sheet}
        onPrev={handlePrev}
        onNext={handleNext}
        onQuit={triggerQuit}
        onClearAll={handleClearCurrentSheet}
      />

      <PresenterCursor />

      {/* Exit fade — sits above everything and fades to black before unmount. */}
      {exiting && (
        <div
          className="absolute inset-0 z-[100] animate-fade-in"
          style={{ background: "#000" }}
          aria-hidden
        />
      )}
    </div>
  );
}

/**
 * A plain HTML `<canvas>` sitting above the Konva stage, used for pen +
 * eraser drawings during the presentation. Strokes are held in a Map
 * keyed by sheetId (owned by PresenterView) so a user can draw on sheet
 * A, navigate to sheet B, and come back to sheet A with their original
 * ink intact. The Map — and all its strokes — is discarded on quit, so
 * annotations are never persisted to the document.
 *
 * This component is remounted on every sheetId change: each mount reads
 * (or registers) the list for the current sheet and mutates it in place
 * for the rest of its lifetime. The "Clear all" control deletes the
 * current sheet's entry from the Map and bumps `presentationClearNonce`,
 * forcing a remount — so the new overlay finds no entry and starts fresh.
 *
 * Stroke model:
 *   - `{ type: "pen", points, color, width, opacity }` — normal ink.
 *   - `{ type: "erase", points, width }` — pixel eraser; replays with
 *     `globalCompositeOperation = "destination-out"` so it subtracts from
 *     the pen strokes beneath.
 *
 * Object eraser does NOT record a stroke — it hit-tests the stored pen
 * strokes against each pointer sample and splices whole strokes out of the
 * list, then triggers a full redraw.
 */

interface PenOverlayProps {
  /** Identifier of the sheet currently being presented. Used as the
   *  lookup key into `strokesMap` so each sheet gets its own stroke list. */
  sheetId: string;
  /** Shared per-sheet stroke store owned by PresenterView. Mutated in
   *  place by this overlay (push on pointer-up, splice on object-erase);
   *  entries persist across slide navigation so the user's drawings come
   *  back when they revisit a sheet. */
  strokesMap: Map<string, Stroke[]>;
  width: number;
  height: number;
  tool: "cursor" | "pen" | "torch" | "eraser";
  color: string;
  weight: number;
  opacity: number;
  eraserMode: "pixel" | "object";
  eraserWidth: number;
}

function PenOverlay({
  sheetId,
  strokesMap,
  width,
  height,
  tool,
  color,
  weight,
  opacity,
  eraserMode,
  eraserWidth,
}: PenOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Lazily bind the local strokes ref to the Map entry for this sheet.
  // On a fresh sheet (no entry yet) we register a new empty array and
  // keep writing to it — the Map holds the same reference, so mutations
  // here are visible next time the user revisits the sheet.
  const strokesRef = useRef<Stroke[] | null>(null);
  if (strokesRef.current === null) {
    const existing = strokesMap.get(sheetId);
    if (existing) {
      strokesRef.current = existing;
    } else {
      const fresh: Stroke[] = [];
      strokesMap.set(sheetId, fresh);
      strokesRef.current = fresh;
    }
  }
  const currentRef = useRef<Stroke | null>(null);
  const drawingRef = useRef<boolean>(false);

  const enabled = tool === "pen" || tool === "eraser";

  function applyStrokeStyle(ctx: CanvasRenderingContext2D, s: Stroke) {
    if (s.type === "erase") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#000"; // irrelevant under destination-out
      ctx.lineWidth = s.width;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = s.opacity;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
    }
  }

  // Full redraw — used on resize, object-erase splice, or settle.
  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of strokesRef.current!) {
      applyStrokeStyle(ctx, s);
      drawSmoothPath(ctx, s.points);
    }
    if (currentRef.current) {
      applyStrokeStyle(ctx, currentRef.current);
      drawSmoothPath(ctx, currentRef.current.points);
    }
    ctx.restore();
  }

  // Redraw whenever dimensions or visible-styling props change. Stroke-style
  // props (color, weight, opacity, eraserWidth) don't mutate existing strokes
  // — they only affect the next one — so no redraw is needed for them. We
  // still need the redraw on size change because the canvas is resized.
  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  function pointIn(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    // setPointerCapture can throw NotFoundError when the pointerId is
    // already inactive (fast tap + release, or synthetic events in tests).
    // Losing the capture just means another element can steal the gesture
    // — not a fatal condition, so swallow and continue.
    try {
      canvas.setPointerCapture?.(e.pointerId);
    } catch {
      /* continue */
    }
    const p = pointIn(e);

    if (tool === "eraser" && eraserMode === "object") {
      drawingRef.current = true;
      eraseObjectsAt(p.x, p.y);
      return;
    }

    if (tool === "eraser" /* && mode === "pixel" */) {
      currentRef.current = { type: "erase", points: [p], width: eraserWidth };
    } else {
      // pen
      currentRef.current = {
        type: "pen",
        points: [p],
        color,
        width: weight,
        opacity,
      };
    }
    drawingRef.current = true;
    redraw();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!enabled || !drawingRef.current) return;
    const p = pointIn(e);

    // Object eraser: no stroke is recorded — just hit-test + splice + redraw.
    if (tool === "eraser" && eraserMode === "object") {
      eraseObjectsAt(p.x, p.y);
      return;
    }

    const current = currentRef.current;
    if (!current) return;
    current.points.push(p);

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx && current.points.length >= 2) {
      // Incremental append — draw only the newest segment. The final redraw
      // on pointer-up reconciles any per-segment alpha artifacts for opacity
      // <100% strokes.
      ctx.save();
      applyStrokeStyle(ctx, current);
      const pts = current.points;
      const a = pts[pts.length - 2];
      const b = pts[pts.length - 1];
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  function onPointerUp() {
    if (!enabled) return;
    const current = currentRef.current;
    if (current && current.points.length > 1) {
      strokesRef.current!.push(current);
    }
    currentRef.current = null;
    drawingRef.current = false;
    // Full redraw so per-stroke opacity settles consistently across joins
    // and any object-eraser splices are reflected.
    redraw();
  }

  // Object eraser: remove any pen stroke whose path lies within pickRadius
  // of the given point. Skips pixel-erase strokes so the object eraser doesn't
  // "undelete" earlier pixel-erase marks.
  function eraseObjectsAt(px: number, py: number) {
    const pickRadius = 12;
    const strokes = strokesRef.current!;
    let changed = false;
    for (let i = strokes.length - 1; i >= 0; i--) {
      const s = strokes[i];
      if (s.type !== "pen") continue;
      const threshold = pickRadius + s.width / 2;
      if (!bboxCircleIntersect(s.points, px, py, threshold)) continue;
      for (const v of s.points) {
        const dx = v.x - px;
        const dy = v.y - py;
        if (dx * dx + dy * dy < threshold * threshold) {
          strokes.splice(i, 1);
          changed = true;
          break;
        }
      }
    }
    if (changed) redraw();
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 z-[10]"
      style={{
        pointerEvents: enabled ? "auto" : "none",
        touchAction: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}

/** Quadratic-curve smoothing between a polyline's vertices. Single
 *  `beginPath → stroke()` call so per-stroke globalAlpha is applied
 *  consistently across the whole path. */
function drawSmoothPath(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

/** Cheap bbox reject for the object eraser hit-test — avoids scanning
 *  vertices when the whole stroke is outside the eraser's pick-circle. */
function bboxCircleIntersect(
  pts: Pt[],
  cx: number,
  cy: number,
  r: number,
): boolean {
  if (pts.length === 0) return false;
  let minX = pts[0].x,
    minY = pts[0].y,
    maxX = pts[0].x,
    maxY = pts[0].y;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < minX) minX = p.x;
    else if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    else if (p.y > maxY) maxY = p.y;
  }
  // Inflate bbox by r; test whether (cx,cy) is inside.
  return cx >= minX - r && cx <= maxX + r && cy >= minY - r && cy <= maxY + r;
}
