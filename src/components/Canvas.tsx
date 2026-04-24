import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Stage,
  Layer,
  Rect,
  Text,
  Line,
  Group,
  Circle,
  Ellipse,
  RegularPolygon,
  Star as KStar,
  Path as KPath,
  Image as KImage,
  Transformer,
} from "react-konva";
import useImage from "use-image";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { KIND_RENDERER, shapePathFor } from "../lib/shapePaths";
import {
  EPS,
  computeElbowPath,
  computeCurvedPath,
  curvatureHandlePos,
  curvatureFromHandle,
  segmentAxis,
  segmentsFromPolyline,
  translateSegmentPerpendicular,
  insertSegmentAtEndpoint,
  canonicalizeOrthogonalPolyline,
  expandLegacyElbowToPolyline,
  buildRoundedElbowPath,
  roundedElbowVisibleSegments,
} from "../lib/lineRouting";
import {
  Plus,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Copy,
  Scissors,
  ClipboardPaste,
  CopyPlus,
  Download,
  MoreHorizontal,
} from "lucide-react";
import { exportSheetAsImage } from "../lib/exportSheet";
import {
  worldToScreen,
  MIN_ERASER_SCREEN_PX,
  MAX_ERASER_SCREEN_PX,
} from "../lib/zoom";
import { Rulers, RULER_SIZE } from "./Rulers";
import { GuideLayer } from "./GuideLayer";
import { CommentPinLayer } from "./comments/CommentPinLayer";
import { collectSnapPoints, snapValue, type SnapKind } from "../lib/snap";
import { formatListLines } from "../lib/listFormat";
import { useStore, uid } from "../store";
import { useThemeVars } from "../theme";
import type {
  EraseMark,
  ImageShape,
  LineShape,
  LineStyle,
  PenShape,
  PenVariant,
  RectShape,
  Sheet,
  Shape,
  ShapeShape,
} from "../types";

/**
 * Build a CSS `cursor` value that renders a small pen/marker/highlighter
 * glyph tinted to the active variant's color. Hotspot is placed at the
 * nib (bottom-left of the SVG) so clicks land where the stroke starts.
 */
/**
 * Minimum distance between (x, y) and any segment of a polyline. Used to
 * hit-test pen/line strokes with a configurable tolerance — click-selection
 * uses a fixed radius, stroke-eraser uses eraserSize/2 directly in world
 * units (eraserSize is stored in world units — see src/lib/zoom.ts).
 */
// A text element is a transparent, borderless rectangle that exists purely to
// hold a TextContent block. It should not behave like a generic shape — no
// resize handles, no border framing — so the typing experience reads as plain
// text on the canvas.
function isTextElement(sh: Shape): boolean {
  return (
    sh.type === "shape" &&
    sh.kind === "rectangle" &&
    !!sh.text &&
    (sh.style.fillOpacity ?? 1) === 0 &&
    !sh.style.borderEnabled
  );
}

function polylineDistance(points: number[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < points.length - 2; i += 2) {
    const ax = points[i];
    const ay = points[i + 1];
    const bx = points[i + 2];
    const by = points[i + 3];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    best = Math.min(best, Math.hypot(cx - x, cy - y));
  }
  return best;
}

function penCursor(variant: PenVariant, color: string): string {
  // Strip leading "#" from hex so we can embed it as URL-encoded %23.
  const hex = color.replace(/^#/, "");
  const fill = `%23${hex}`;
  // 24x24 viewBox, nib at (3, 21). All SVG attributes use single quotes so
  // the outer url("...") wrapper can use double quotes without conflict.
  const body =
    variant === "highlighter"
      ? `<path d='M5 17 L14 8 L19 13 L10 22 L3 22 Z' fill='${fill}' stroke='%23111' stroke-width='1.2' stroke-linejoin='round'/>`
      : variant === "marker"
      ? `<path d='M5 17 L15 7 L20 12 L10 22 L3 22 Z' fill='${fill}' stroke='%23111' stroke-width='1.2' stroke-linejoin='round'/>`
      : `<path d='M6 16 L16 6 L19 9 L9 19 L4 20 Z' fill='${fill}' stroke='%23111' stroke-width='1.2' stroke-linejoin='round'/>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>${body}</svg>`;
  return `url("data:image/svg+xml;utf8,${svg}") 3 21, crosshair`;
}

function commentCursor(): string {
  // Speech-bubble glyph tinted brand-500 (#6366f1); hotspot at bottom-left to
  // match the pin drop point the user is clicking on.
  const fill = "%236366f1";
  const body =
    `<path d='M3 4 h16 a2 2 0 0 1 2 2 v10 a2 2 0 0 1 -2 2 h-9 l-5 4 v-4 h-2 a2 2 0 0 1 -2 -2 v-10 a2 2 0 0 1 2 -2 z' ` +
    `fill='${fill}' stroke='%23ffffff' stroke-width='1.2' stroke-linejoin='round'/>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>${body}</svg>`;
  return `url("data:image/svg+xml;utf8,${svg}") 3 21, crosshair`;
}

interface Props {
  width: number;
  height: number;
}

export function Canvas({ width, height }: Props) {
  const zoom = useStore((s) => s.zoom);
  const pan = useStore((s) => s.pan);
  const setPan = useStore((s) => s.setPan);
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const sheets = useStore((s) => s.sheets);
  const shapes = useStore((s) => s.shapes);
  const activeSheetId = useStore((s) => s.activeSheetId);
  const setActiveSheet = useStore((s) => s.setActiveSheet);
  const selectedSheetId = useStore((s) => s.selectedSheetId);
  const selectSheet = useStore((s) => s.selectSheet);
  const setSheetPosition = useStore((s) => s.setSheetPosition);
  const setSheetRotation = useStore((s) => s.setSheetRotation);
  const addShape = useStore((s) => s.addShape);
  const updateShape = useStore((s) => s.updateShape);
  const selectShape = useStore((s) => s.selectShape);
  const selectedShapeId = useStore((s) => s.selectedShapeId);
  const selectedShapeIds = useStore((s) => s.selectedShapeIds);
  const setSelectedShapeIds = useStore((s) => s.setSelectedShapeIds);
  const selectedSheetIds = useStore((s) => s.selectedSheetIds);
  const setSelectedSheetIds = useStore((s) => s.setSelectedSheetIds);
  const showRulerH = useStore((s) => s.showRulerH);
  const showRulerV = useStore((s) => s.showRulerV);
  const gridMode = useStore((s) => s.gridMode);
  const gridGap = useStore((s) => s.gridGap);
  const toolColors = useStore((s) => s.toolColors);
  const toolStrokeWidth = useStore((s) => s.toolStrokeWidth);
  const toolFontSize = useStore((s) => s.toolFontSize);
  const toolFont = useStore((s) => s.toolFont);
  const toolTextDefaults = useStore((s) => s.toolTextDefaults);
  const penVariant = useStore((s) => s.penVariant);
  const penVariants = useStore((s) => s.penVariants);
  const eraserVariant = useStore((s) => s.eraserVariant);
  const eraserSize = useStore((s) => s.eraserSize);
  const shapeKind = useStore((s) => s.shapeKind);
  const shapeDefaults = useStore((s) => s.shapeDefaults);
  const lineRouting = useStore((s) => s.lineRouting);
  const linePattern = useStore((s) => s.linePattern);
  const lineStartMarker = useStore((s) => s.lineStartMarker);
  const lineEndMarker = useStore((s) => s.lineEndMarker);
  const lineOpacity = useStore((s) => s.lineOpacity);
  // guides
  const guides = useStore((s) => s.guides);
  const selectedGuideId = useStore((s) => s.selectedGuideId);
  const addGuide = useStore((s) => s.addGuide);
  const updateGuide = useStore((s) => s.updateGuide);
  const commitGuide = useStore((s) => s.commitGuide);
  const deleteGuide = useStore((s) => s.deleteGuide);
  const setSelectedGuideId = useStore((s) => s.setSelectedGuideId);
  const theme = useThemeVars();

  const stageRef = useRef<Konva.Stage>(null);
  const worldGroupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const overlayInnerRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState<Shape | null>(null);
  // Live pen-points accumulator. We can't mutate `drawing` (it's React state)
  // and we don't want to bump the store on every sample (that'd thrash undo
  // and re-render the world). The ref holds the latest in-flight polyline so
  // each onMouseMove sample appends without re-reading the store.
  const drawPointsRef = useRef<number[]>([]);
  const [erasing, setErasing] = useState(false);
  // Screen-space pointer position for the stroke-eraser circle overlay. Null
  // when the pointer is outside the canvas or a non-stroke-eraser tool is active.
  const [eraserPos, setEraserPos] = useState<{ x: number; y: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const lastPan = useRef<{ x: number; y: number } | null>(null);
  // Marquee ("rubber-band") selection: drags originated on empty board in
  // select mode. Rendered as an overlay Rect; on mouseup we bbox-test every
  // shape and commit via setSelectedShapeIds.
  const [marquee, setMarquee] = useState<{
    x0: number; y0: number; x1: number; y1: number;
  } | null>(null);
  // Group-drag state: when the user drags a shape that's part of the
  // multi-selection, we snapshot every selected shape's position on dragStart
  // and apply the delta to siblings on dragMove.
  const groupDragRef = useRef<{
    anchorId: string;
    anchorStart: { x: number; y: number };
    // Last committed delta so we don't double-apply when computing new deltas.
    lastDx: number;
    lastDy: number;
  } | null>(null);
  // Guide drag state. One at a time: either creating a new guide (id=null)
  // via ruler-drag, or repositioning an existing one. `preDragValue` lets
  // commitGuide skip history pushes on no-op drags and supports Esc rollback.
  const [draftGuide, setDraftGuide] = useState<{
    axis: "h" | "v";
    value: number;
  } | null>(null);
  // Transient snap-feedback state. Set whenever the active drag's raw world
  // value lands within the snap threshold of a candidate (sheet edge/center,
  // another guide, or grid). Cleared on every mousemove that misses, and by
  // `endGuideDrag`. Drives the red-line recolor + the perpendicular tick in
  // GuideLayer. Not persisted to the store — purely UI.
  const [snapIndicator, setSnapIndicator] = useState<{
    axis: "h" | "v";
    value: number;
    kind: SnapKind;
  } | null>(null);
  const [deleteHoverGuideId, setDeleteHoverGuideId] = useState<string | null>(
    null
  );
  const guideDragRef = useRef<{
    mode: "create" | "reposition";
    id: string | null;
    axis: "h" | "v";
    preDragValue: number;
    cleanup: (() => void) | null;
  } | null>(null);
  // While panning/zooming we mutate panRef/zoomRef and apply the transform to
  // Konva + HTML overlay imperatively, committing to the store only after the
  // gesture ends. This avoids a full-tree re-render per event.
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  // RAF-coalesced draw patch so live drawing touches the store at most once per frame.
  const drawRafRef = useRef<number | null>(null);
  const pendingDrawPatchRef = useRef<{
    id: string;
    patch: Partial<Shape>;
  } | null>(null);

  // expose stage to the SheetToolbar export action (once on mount only)
  useEffect(() => {
    const win = window as unknown as { __spaceshow_stage?: Konva.Stage | null };
    win.__spaceshow_stage = stageRef.current;
    const captured = stageRef.current;
    return () => {
      if (win.__spaceshow_stage === captured) {
        delete win.__spaceshow_stage;
      }
    };
  }, []);

  // Keep panRef / zoomRef in sync when the store changes (external commits
  // via fitAllSheets, keyboard zoom shortcuts, etc.) so the next gesture
  // starts from the committed values.
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Hide the stroke-eraser circle whenever the tool or variant changes away
  // from stroke-eraser, so a stale cursor doesn't linger.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!(tool === "eraser" && eraserVariant === "stroke")) setEraserPos(null);
  }, [tool, eraserVariant]);

  // Wire the Transformer to the currently-selected "shape" nodes. Re-runs on
  // any selection / tool / shape mutation so freshly-drawn shapes pick up the
  // handles immediately. Locked / hidden shapes are excluded.
  useEffect(() => {
    const tr = transformerRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    if (tool !== "select") {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    const ids =
      selectedShapeIds.length > 0
        ? selectedShapeIds
        : selectedShapeId
        ? [selectedShapeId]
        : [];
    const byId = new Map(shapes.map((s) => [s.id, s] as const));
    const nodes: Konva.Node[] = [];
    for (const id of ids) {
      const sh = byId.get(id);
      if (!sh || sh.type !== "shape" || !sh.visible || sh.locked) continue;
      // Text elements skip the transformer — they read as a plain text caret
      // surface, not a resizable shape. Resizing happens via font size + the
      // textarea wrapping naturally to its content box.
      if (isTextElement(sh)) continue;
      const node = stage.findOne("#" + id);
      if (node) nodes.push(node);
    }
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedShapeId, selectedShapeIds, tool, shapes]);

  // Build a lookup once per shapes-change so the sheet map is O(sheets + shapes)
  // instead of O(sheets × shapes) per render.
  const shapesBySheet = useMemo(() => {
    const m = new Map<string, Shape[]>();
    for (const sh of shapes) {
      if (!sh.visible) continue;
      const arr = m.get(sh.sheetId) || [];
      arr.push(sh);
      m.set(sh.sheetId, arr);
    }
    return m;
  }, [shapes]);

  const leftOffset = showRulerV ? RULER_SIZE : 0;
  const topOffset = showRulerH ? RULER_SIZE : 0;
  const stageW = Math.max(0, width - leftOffset);
  const stageH = Math.max(0, height - topOffset);

  // Wheel handler. Both pan and zoom are applied imperatively to the Konva
  // world group + HTML overlay. No React / store work during the gesture —
  // we only commit the final pan+zoom to the store once the wheel stream
  // stops (100ms of silence), so the rest of the UI (Rulers, BottomBar,
  // Overlay) reconciles exactly once per gesture instead of per event.
  useEffect(() => {
    const node = stageRef.current?.container?.();
    if (!node) return;
    let commitTimer: number | null = null;

    // Apply the current panRef/zoomRef values to Konva + the HTML "+" overlay.
    // Overlay children are positioned using COMMITTED pan/zoom (from the store),
    // so we apply `translate + scale` with transform-origin:0 0 so the overlay
    // visually matches the imperative world transform during the gesture.
    function applyTransform() {
      const wg = worldGroupRef.current;
      if (wg) {
        wg.position({ x: panRef.current.x, y: panRef.current.y });
        wg.scale({ x: zoomRef.current, y: zoomRef.current });
        wg.getLayer()?.batchDraw();
      }
      if (overlayInnerRef.current) {
        const st = useStore.getState();
        const s = zoomRef.current / st.zoom;
        const tx = panRef.current.x - st.pan.x * s;
        const ty = panRef.current.y - st.pan.y * s;
        overlayInnerRef.current.style.transformOrigin = "0 0";
        overlayInnerRef.current.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      }
    }

    function scheduleCommit() {
      if (commitTimer !== null) window.clearTimeout(commitTimer);
      commitTimer = window.setTimeout(() => {
        commitTimer = null;
        const st = useStore.getState();
        const np = panRef.current;
        const nz = zoomRef.current;
        // Reset overlay transform BEFORE committing so React's re-render sees
        // a clean baseline; the overlay children re-lay out against the new
        // store values, matching the final visual position.
        if (overlayInnerRef.current) {
          overlayInnerRef.current.style.transform = "";
        }
        if (nz !== st.zoom) st.setZoom(nz);
        if (np.x !== st.pan.x || np.y !== st.pan.y) st.setPan(np);
      }, 100);
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Zoom around the cursor. Anchor the world-point under the cursor so
        // it stays still as we scale.
        const factorStep = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const oldZoom = zoomRef.current;
        const newZoom = Math.min(4, Math.max(0.05, oldZoom * factorStep));
        // World coords of the cursor using CURRENT (in-gesture) transform.
        const worldX = (cx - panRef.current.x) / oldZoom;
        const worldY = (cy - panRef.current.y) / oldZoom;
        zoomRef.current = newZoom;
        panRef.current = {
          x: cx - worldX * newZoom,
          y: cy - worldY * newZoom,
        };
      } else {
        // Pan. No store write.
        panRef.current = {
          x: panRef.current.x - e.deltaX,
          y: panRef.current.y - e.deltaY,
        };
      }
      applyTransform();
      scheduleCommit();
    }

    node.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      node.removeEventListener("wheel", onWheel);
      if (commitTimer !== null) window.clearTimeout(commitTimer);
    };
  }, []);

  function screenToWorld(x: number, y: number) {
    return { x: (x - pan.x) / zoom, y: (y - pan.y) / zoom };
  }

  // ── Guide drag helpers ────────────────────────────────────────────────
  // Return hit-test result for the viewport-level ruler strips. Used during
  // guide drag to either reject a ruler-create drop (released back inside
  // the ruler) or trigger delete-by-drag-back on a reposition.
  function rulerHit(clientX: number, clientY: number): { h: boolean; v: boolean } {
    const stage = stageRef.current?.container();
    if (!stage) return { h: false, v: false };
    const r = stage.getBoundingClientRect();
    const topOff = showRulerH ? RULER_SIZE : 0;
    const leftOff = showRulerV ? RULER_SIZE : 0;
    const inH =
      showRulerH &&
      clientY >= r.top - topOff &&
      clientY < r.top &&
      clientX >= r.left - leftOff &&
      clientX < r.left + r.width;
    const inV =
      showRulerV &&
      clientX >= r.left - leftOff &&
      clientX < r.left &&
      clientY >= r.top - topOff &&
      clientY < r.top + r.height;
    return { h: inH, v: inV };
  }

  // Convert a viewport client position to world coordinates using the Stage's
  // local origin. Returns null if the stage isn't mounted yet.
  function clientToWorld(clientX: number, clientY: number) {
    const stage = stageRef.current?.container();
    if (!stage) return null;
    const r = stage.getBoundingClientRect();
    const stageX = clientX - r.left;
    const stageY = clientY - r.top;
    return {
      stageX,
      stageY,
      worldX: (stageX - pan.x) / zoom,
      worldY: (stageY - pan.y) / zoom,
    };
  }

  // Run a raw world value through the snap engine against current sheets +
  // guides + grid. Matches the "~8 screen-px tolerance" feel across zoom by
  // scaling the threshold with zoom.
  function snapGuideValue(
    axis: "h" | "v",
    raw: number,
    excludeGuideId?: string
  ): { value: number; source: SnapKind | null } {
    const candidates = collectSnapPoints(axis, sheets, guides, excludeGuideId);
    const thresholdWorld = 8 / zoom;
    const gg = gridMode === "plain" ? null : gridGap;
    return snapValue(raw, candidates, thresholdWorld, gg);
  }

  // Unified teardown — called on mouseup, on Esc, and when unmounting mid-drag.
  function endGuideDrag() {
    const drag = guideDragRef.current;
    if (drag?.cleanup) drag.cleanup();
    guideDragRef.current = null;
    setDraftGuide(null);
    setDeleteHoverGuideId(null);
    setSnapIndicator(null);
    document.body.removeAttribute("data-guide-dragging");
    document.body.removeAttribute("data-guide-delete-hover");
  }

  // Start a drag pulling a new guide out of a ruler strip. `axis` is the
  // guide's axis (h-ruler drag creates an H guide; v-ruler creates V).
  function startRulerDrag(axis: "h" | "v", e: React.MouseEvent) {
    if (guideDragRef.current) return; // already dragging
    const initial = clientToWorld(e.clientX, e.clientY);
    if (!initial) return;
    const rawValue = axis === "h" ? initial.worldY : initial.worldX;
    const initialSnap = snapGuideValue(axis, rawValue);
    setDraftGuide({ axis, value: initialSnap.value });
    setSnapIndicator(
      initialSnap.source
        ? { axis, value: initialSnap.value, kind: initialSnap.source }
        : null
    );
    document.body.setAttribute("data-guide-dragging", axis);

    const onMove = (ev: MouseEvent) => {
      const w = clientToWorld(ev.clientX, ev.clientY);
      if (!w) return;
      const raw = axis === "h" ? w.worldY : w.worldX;
      const { value, source } = snapGuideValue(axis, raw);
      setDraftGuide({ axis, value });
      setSnapIndicator(source ? { axis, value, kind: source } : null);
    };
    const onUp = (ev: MouseEvent) => {
      // Only commit if released INSIDE the canvas area (not back in the ruler).
      const hit = rulerHit(ev.clientX, ev.clientY);
      const w = clientToWorld(ev.clientX, ev.clientY);
      const released = !hit.h && !hit.v && w !== null;
      if (released) {
        const raw = axis === "h" ? w!.worldY : w!.worldX;
        addGuide(axis, snapGuideValue(axis, raw).value);
      }
      endGuideDrag();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") endGuideDrag();
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("keydown", onKey);
    guideDragRef.current = {
      mode: "create",
      id: null,
      axis,
      preDragValue: 0,
      cleanup: () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("keydown", onKey);
      },
    };
  }

  // Start a drag repositioning an existing guide. `id` selects the guide;
  // on release the guide is either committed (pushHistory once) or deleted
  // if the pointer is inside the origin ruler strip.
  function startGuideReposition(id: string, e: MouseEvent) {
    if (guideDragRef.current) return;
    const guide = useStore.getState().guides.find((g) => g.id === id);
    if (!guide) return;
    setSelectedGuideId(id);
    document.body.setAttribute("data-guide-dragging", guide.axis);

    const onMove = (ev: MouseEvent) => {
      const w = clientToWorld(ev.clientX, ev.clientY);
      if (!w) return;
      const raw = guide.axis === "h" ? w.worldY : w.worldX;
      const { value, source } = snapGuideValue(guide.axis, raw, id);
      updateGuide(id, value);
      setSnapIndicator(
        source ? { axis: guide.axis, value, kind: source } : null
      );
      const hit = rulerHit(ev.clientX, ev.clientY);
      const overOrigin = guide.axis === "h" ? hit.h : hit.v;
      setDeleteHoverGuideId(overOrigin ? id : null);
      if (overOrigin) {
        document.body.setAttribute("data-guide-delete-hover", "true");
      } else {
        document.body.removeAttribute("data-guide-delete-hover");
      }
    };
    const onUp = (ev: MouseEvent) => {
      const hit = rulerHit(ev.clientX, ev.clientY);
      const overOrigin = guide.axis === "h" ? hit.h : hit.v;
      if (overOrigin) {
        deleteGuide(id);
      } else {
        commitGuide(id, guide.value); // preDragValue = snapshot at drag start
      }
      endGuideDrag();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        // Roll back to the pre-drag value without pushing history.
        updateGuide(id, guide.value);
        endGuideDrag();
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("keydown", onKey);
    guideDragRef.current = {
      mode: "reposition",
      id,
      axis: guide.axis,
      preDragValue: guide.value,
      cleanup: () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("keydown", onKey);
      },
    };
    // Prevent the event from reaching Konva's Stage click logic.
    e.preventDefault?.();
    e.stopPropagation?.();
  }

  // Clean up any active drag on unmount.
  useEffect(() => {
    return () => {
      const drag = guideDragRef.current;
      if (drag?.cleanup) drag.cleanup();
      document.body.removeAttribute("data-guide-dragging");
      document.body.removeAttribute("data-guide-delete-hover");
    };
  }, []);

  function findSheetAt(wx: number, wy: number) {
    return [...sheets].reverse().find(
      (s) => wx >= s.x && wx <= s.x + s.width && wy >= s.y && wy <= s.y + s.height
    );
  }

  // Stroke-eraser helper: for each pen shape on this sheet whose rendered
  // thick stroke intersects the eraser circle, push an erase mark onto the
  // shape. Rendering punches a destination-out hole of that size, so a 2px
  // eraser on a 10px stroke leaves the stroke mostly visible with a 2px
  // circular hole at the cursor — Canva-style raster-accurate erasing that
  // keeps the underlying polyline data intact (vector crispness preserved).
  function eraseStrokesAt(lx: number, ly: number, sheetId: string | undefined) {
    // eraserSize is in WORLD units (Canva-style). New erase marks are stored
    // in world units too. Pre-world-units pen shapes (strokeWidthUnit !==
    // "world") still store strokeWidth in "screen px at creation-zoom", so
    // we branch when converting stroke half-thickness into world space.
    const rWorld = eraserSize / 2;
    const state = useStore.getState();
    const live = state.shapes;
    for (const sh of live) {
      if (sh.sheetId !== sheetId) continue;
      if (sh.type !== "pen") continue;
      const pts = sh.points;
      if (!pts || pts.length < 4) continue;
      const ox = sh.x || 0;
      const oy = sh.y || 0;
      const strokeHalfWorld =
        sh.strokeWidthUnit === "world"
          ? (sh.strokeWidth ?? 1) / 2
          : (sh.strokeWidth ?? 1) / 2 / zoom;
      // Cursor reaches paint when world distance to centerline <=
      // eraser half + stroke half (both in world units).
      const reachWorld = rWorld + strokeHalfWorld;
      const lxLocal = lx - ox;
      const lyLocal = ly - oy;
      if (polylineDistance(pts, lxLocal, lyLocal) > reachWorld) continue;

      // Dedupe: skip if the new world-disc lies entirely inside the last
      // stored disc. For legacy ("screen") marks, convert their r to world
      // via /zoom so the comparison is apples-to-apples.
      const existing: EraseMark[] = sh.eraseMarks ?? [];
      const last = existing[existing.length - 1];
      if (last) {
        const lastRWorld =
          last.unit === "world" ? last.r : last.r / zoom;
        const dWorld = Math.hypot(last.cx - lxLocal, last.cy - lyLocal);
        if (dWorld + rWorld <= lastRWorld) continue;
      }
      state.updateShape(sh.id, {
        eraseMarks: [
          ...existing,
          { cx: lxLocal, cy: lyLocal, r: rWorld, unit: "world" },
        ],
      } as Partial<Shape>);
    }
  }

  // After the drag ends, delete any pen shape whose polyline centerline is
  // fully covered by erase marks — otherwise an empty shell lingers in the
  // layers panel. Runs once on mouseup, not per sample.
  function pruneFullyErasedStrokes() {
    const state = useStore.getState();
    for (const sh of state.shapes) {
      if (sh.type !== "pen") continue;
      const marks = sh.eraseMarks;
      if (!marks || marks.length === 0) continue;
      const pts = sh.points;
      if (!pts || pts.length < 2) continue;
      // stroke half-thickness in WORLD units: new shapes store strokeWidth as
      // world, legacy shapes store as screen-px so we /zoom.
      const strokeHalfWorld =
        sh.strokeWidthUnit === "world"
          ? (sh.strokeWidth ?? 1) / 2
          : (sh.strokeWidth ?? 1) / 2 / zoom;
      let allCovered = true;
      for (let i = 0; i < pts.length; i += 2) {
        const px = pts[i];
        const py = pts[i + 1];
        let covered = false;
        for (const m of marks) {
          const dx = px - m.cx;
          const dy = py - m.cy;
          // mark radius in WORLD units: new marks stored as world, legacy
          // marks stored as screen-px / creation-zoom so we /zoom.
          const markRWorld = m.unit === "world" ? m.r : m.r / zoom;
          const rEffWorld = markRWorld + strokeHalfWorld;
          if (dx * dx + dy * dy <= rEffWorld * rEffWorld) {
            covered = true;
            break;
          }
        }
        if (!covered) {
          allCovered = false;
          break;
        }
      }
      if (allCovered) state.deleteShape(sh.id);
    }
  }

  function onMouseDown(e: KonvaEventObject<MouseEvent>) {
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const { x: wx, y: wy } = screenToWorld(pointer.x, pointer.y);

    const evt = e.evt;

    // Middle-click always pans the board.
    if (evt.button === 1) {
      setIsPanning(true);
      lastPan.current = { x: evt.clientX, y: evt.clientY };
      panRef.current = { ...pan };
      return;
    }

    // Select-tool drag on empty board → marquee select. We start the
    // rectangle at the pointer and update it on every mousemove; on mouseup
    // we commit hit-tested shapes to the multi-selection.
    if (tool === "select" && e.target === stage) {
      selectShape(null);
      setSelectedShapeIds([]);
      if (!findSheetAt(wx, wy)) {
        selectSheet(null);
        setSelectedSheetIds([]);
      }
      setMarquee({ x0: wx, y0: wy, x1: wx, y1: wy });
      return;
    }

    if (tool === "select") {
      // selection handled by the Rect's onClick
      return;
    }

    // Comment tool: drop a thread pin, open the sidebar to the new thread,
    // and revert to Select so it's a one-shot action (same ergonomics as
    // Sticky/Text). The composer subscribes to pendingFocusThreadId so it
    // can grab keyboard focus on mount without us routing an extra event.
    if (tool === "comment") {
      const targetSheet = findSheetAt(wx, wy);
      const canvasId = targetSheet?.id ?? "board";
      const localX = targetSheet ? wx - targetSheet.x : wx;
      const localY = targetSheet ? wy - targetSheet.y : wy;
      const st = useStore.getState();
      const newThreadId = st.addThread({
        canvasId,
        coordinates: { x: localX, y: localY },
      });
      st.openRightPanel("comments");
      st.setActiveThread(newThreadId);
      st.setTool("select");
      useStore.setState({ pendingFocusThreadId: newThreadId });
      return;
    }

    // Drawing-tool branch: clear any prior selection so stale handles
    // (e.g. a previously-selected line's endpoint/waypoint circles) don't
    // render on top of the new shape being drawn.
    if (useStore.getState().selectedShapeId) selectShape(null);
    if (useStore.getState().selectedShapeIds.length) setSelectedShapeIds([]);

    const targetSheet = findSheetAt(wx, wy);
    const sheetId = targetSheet?.id ?? "board";
    if (targetSheet) setActiveSheet(targetSheet.id);
    const localX = targetSheet ? wx - targetSheet.x : wx;
    const localY = targetSheet ? wy - targetSheet.y : wy;

    const id = uid("shape");
    let newShape: Shape | null = null;

    if (tool === "rect") {
      newShape = {
        id,
        type: "rect",
        sheetId,
        name: `Rectangle`,
        visible: true,
        locked: false,
        x: localX,
        y: localY,
        width: 1,
        height: 1,
        fill: toolColors.rect,
      };
    } else if (tool === "shape") {
      const isPolygon = shapeKind === "polygon";
      newShape = {
        id,
        type: "shape",
        kind: shapeKind,
        sheetId,
        name: shapeKind.charAt(0).toUpperCase() + shapeKind.slice(1),
        visible: true,
        locked: false,
        x: localX,
        y: localY,
        width: 1,
        height: 1,
        style: { ...shapeDefaults },
        ...(isPolygon ? { polygonSides: 5 } : {}),
      } as Shape;
    } else if (tool === "pen") {
      const variantSettings = penVariants[penVariant];
      const variantName =
        penVariant === "marker"
          ? "Marker stroke"
          : penVariant === "highlighter"
          ? "Highlighter stroke"
          : "Pen stroke";
      newShape = {
        id,
        type: "pen",
        sheetId,
        name: variantName,
        visible: true,
        locked: false,
        x: 0,
        y: 0,
        rotation: 0,
        points: [localX, localY],
        stroke: variantSettings.color,
        strokeWidth: variantSettings.weight,
        strokeWidthUnit: "world",
        variant: penVariant,
        opacity: variantSettings.opacity,
      };
    } else if (tool === "line") {
      newShape = {
        id,
        type: "line",
        sheetId,
        name: "Line",
        visible: true,
        locked: false,
        x: 0,
        y: 0,
        points: [localX, localY, localX, localY],
        stroke: toolColors.line,
        strokeWidth: toolStrokeWidth,
        strokeWidthUnit: "world",
        routing: lineRouting,
        pattern: linePattern,
        startMarker: lineStartMarker,
        endMarker: lineEndMarker,
        opacity: lineOpacity,
        elbowOrientation: "HV",
        curvature: lineRouting === "curved" ? 0.3 : undefined,
      };
    } else if (tool === "sticky") {
      const sticky: Shape = {
        id,
        type: "sticky",
        sheetId,
        name: "Sticky note",
        visible: true,
        locked: false,
        x: localX,
        y: localY,
        width: 180,
        height: 140,
        fill: toolColors.sticky,
        text: "Note",
      };
      addShape(sticky);
      setTool("select");
      selectShape(sticky.id);
      return;
    } else if (tool === "text") {
      const sz = toolFontSize;
      const txt: ShapeShape = {
        id,
        type: "shape",
        kind: "rectangle",
        sheetId,
        name: "Text",
        visible: true,
        locked: false,
        x: localX,
        y: localY,
        width: 240,
        height: Math.max(40, Math.round(sz * 1.6)),
        rotation: 0,
        groupId: null,
        style: {
          borderEnabled: false,
          borderWeight: 0,
          borderColor: "#2c2a27",
          borderStyle: "solid",
          cornerRadius: 0,
          fillColor: "#ffffff",
          fillOpacity: 0,
        },
        text: {
          text: "",
          font: toolFont,
          fontSize: sz,
          color: toolColors.text,
          bold: toolTextDefaults.bold,
          italic: toolTextDefaults.italic,
          underline: toolTextDefaults.underline,
          align: toolTextDefaults.align,
          bullets: toolTextDefaults.bullets,
          indent: toolTextDefaults.indent,
          bgColor: toolTextDefaults.bgColor,
          bulletStyle: toolTextDefaults.bulletStyle,
          numberStyle: toolTextDefaults.numberStyle,
        },
      };
      addShape(txt);
      setTool("select");
      selectShape(txt.id);
      useStore.getState().beginTextEdit(txt.id);
      return;
    } else if (tool === "eraser") {
      if (eraserVariant === "object") {
        // hit-test top-most shape on this sheet and delete
        const onSheet = shapes.filter((s) => s.sheetId === sheetId);
        for (let i = onSheet.length - 1; i >= 0; i--) {
          const sh = onSheet[i];
          if (hitTest(sh, localX, localY)) {
            useStore.getState().deleteShape(sh.id);
            break;
          }
        }
        return;
      }
      // Stroke eraser: begin a drag session. One undo entry per drag.
      useStore.getState().beginHistoryCoalesce(`erase-${uid()}`);
      setErasing(true);
      eraseStrokesAt(localX, localY, sheetId);
      return;
    }

    if (newShape) {
      // Coalesce: a single draw gesture (addShape + many updateShape calls) should
      // collapse into ONE undo entry. We begin coalescing before addShape so the
      // snapshot captured there is the only one pushed for this gesture.
      useStore.getState().beginHistoryCoalesce(`draw-${newShape.id}`);
      addShape(newShape);
      setDrawing(newShape);
      if (newShape.type === "pen" || newShape.type === "line") {
        drawPointsRef.current = [...newShape.points];
      } else {
        drawPointsRef.current = [];
      }
    }
  }

  function onMouseMove(e: KonvaEventObject<MouseEvent>) {
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    // Track pointer for the stroke-eraser circle overlay. Screen-space coords
    // because the overlay div sits above the Stage, not inside the world group.
    if (tool === "eraser" && eraserVariant === "stroke") {
      setEraserPos({ x: pointer.x, y: pointer.y });
    }

    // Update the marquee rectangle as the pointer moves. World-space coords
    // so the box stays aligned with the content while the user pans/zooms.
    if (marquee) {
      const w = screenToWorld(pointer.x, pointer.y);
      setMarquee((m) => (m ? { ...m, x1: w.x, y1: w.y } : m));
      return;
    }

    if (isPanning && lastPan.current) {
      const evt = e.evt;
      const dx = evt.clientX - lastPan.current.x;
      const dy = evt.clientY - lastPan.current.y;
      lastPan.current = { x: evt.clientX, y: evt.clientY };
      // Imperative pan: mutate ref, translate the single world-group and the
      // HTML "+" overlay. No store write -> no React re-render. The store is
      // synced on mouseup so other components (Rulers, BottomBar) see the
      // committed value.
      panRef.current = {
        x: panRef.current.x + dx,
        y: panRef.current.y + dy,
      };
      const wg = worldGroupRef.current;
      if (wg) {
        wg.position({ x: panRef.current.x, y: panRef.current.y });
        wg.getLayer()?.batchDraw();
      }
      if (overlayInnerRef.current) {
        const tx = panRef.current.x - pan.x;
        const ty = panRef.current.y - pan.y;
        overlayInnerRef.current.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
      }
      return;
    }

    if (tool === "eraser" && eraserVariant === "stroke" && erasing) {
      const { x: wx, y: wy } = screenToWorld(pointer.x, pointer.y);
      const sheet = findSheetAt(wx, wy);
      const lx = sheet ? wx - sheet.x : wx;
      const ly = sheet ? wy - sheet.y : wy;
      eraseStrokesAt(lx, ly, sheet?.id);
      return;
    }

    if (!drawing) return;
    const { x: wx, y: wy } = screenToWorld(pointer.x, pointer.y);
    const sheet = sheets.find((s) => s.id === drawing.sheetId);
    const localX = sheet ? wx - sheet.x : wx;
    const localY = sheet ? wy - sheet.y : wy;

    // Queue at most one updateShape call per frame while drawing; the final
    // sample is flushed on mouseup so the last point is never lost.
    function scheduleDrawPatch(id: string, patch: Partial<Shape>) {
      pendingDrawPatchRef.current = { id, patch };
      if (drawRafRef.current !== null) return;
      drawRafRef.current = requestAnimationFrame(() => {
        drawRafRef.current = null;
        const pending = pendingDrawPatchRef.current;
        pendingDrawPatchRef.current = null;
        if (pending) updateShape(pending.id, pending.patch);
      });
    }

    if (drawing.type === "rect") {
      scheduleDrawPatch(drawing.id, {
        width: localX - drawing.x,
        height: localY - drawing.y,
      } as Partial<Shape>);
    } else if (drawing.type === "shape") {
      const dx = localX - drawing.x;
      const dy = localY - drawing.y;
      const shift = !!e.evt.shiftKey;
      let w = dx;
      let h = dy;
      if (shift) {
        const m = Math.max(Math.abs(dx), Math.abs(dy));
        w = (dx < 0 ? -1 : 1) * m;
        h = (dy < 0 ? -1 : 1) * m;
      }
      scheduleDrawPatch(drawing.id, { width: w, height: h } as Partial<Shape>);
    } else if (drawing.type === "pen") {
      const pts = [...drawPointsRef.current, localX, localY];
      drawPointsRef.current = pts;
      scheduleDrawPatch(drawing.id, { points: pts } as Partial<Shape>);
    } else if (drawing.type === "line") {
      const start = drawPointsRef.current.slice(0, 2);
      scheduleDrawPatch(drawing.id, {
        points: [start[0], start[1], localX, localY],
      } as Partial<Shape>);
    }
  }

  // Shift+click on a shape toggles its membership in the multi-selection.
  // Regular click replaces the selection with just this shape.
  // Alt+click escapes group expansion — picks the literal shape only.
  function onShapeClickSelect(
    id: string,
    e?: KonvaEventObject<MouseEvent | TouchEvent>
  ) {
    // shiftKey/altKey only exist on MouseEvent; touch taps lack them, so the
    // !! coerces undefined to false on the TouchEvent branch.
    const me = e?.evt as MouseEvent | undefined;
    const shift = !!me?.shiftKey;
    const alt = !!me?.altKey;
    if (shift) {
      const cur = useStore.getState().selectedShapeIds;
      const next = cur.includes(id)
        ? cur.filter((x) => x !== id)
        : [...cur, id];
      setSelectedShapeIds(next, alt);
    } else {
      selectShape(id, alt);
    }
  }

  // Group-drag handlers: when the anchor shape is part of the multi-
  // selection, siblings receive the same delta. We apply deltas
  // incrementally (only the difference since the last move) so updateShape
  // calls are additive. The whole drag coalesces into one undo entry.
  function onShapeGroupDragStart(anchorId: string) {
    if (!selectedShapeIds.includes(anchorId)) return;
    const anchor = useStore.getState().shapes.find((s) => s.id === anchorId);
    if (!anchor) return;
    useStore
      .getState()
      .beginHistoryCoalesce(`group-drag-${anchorId}-${uid()}`);
    groupDragRef.current = {
      anchorId,
      anchorStart: { x: anchor.x, y: anchor.y },
      lastDx: 0,
      lastDy: 0,
    };
  }
  function onShapeGroupDragMove(anchorId: string, nx: number, ny: number) {
    const g = groupDragRef.current;
    if (!g || g.anchorId !== anchorId) return;
    const dx = nx - g.anchorStart.x;
    const dy = ny - g.anchorStart.y;
    const ddx = dx - g.lastDx;
    const ddy = dy - g.lastDy;
    if (ddx === 0 && ddy === 0) return;
    // Move every selected shape EXCEPT the anchor (Konva already moved the
    // anchor visually; updating it would double-apply).
    useStore.setState((s) => {
      const ids = new Set(s.selectedShapeIds);
      ids.delete(anchorId);
      if (ids.size === 0) return {} as Partial<typeof s>;
      return {
        shapes: s.shapes.map((sh) =>
          ids.has(sh.id) && !sh.locked
            ? ({ ...sh, x: sh.x + ddx, y: sh.y + ddy } as Shape)
            : sh
        ),
      };
    });
    g.lastDx = dx;
    g.lastDy = dy;
  }
  function onShapeGroupDragEnd() {
    if (groupDragRef.current) {
      groupDragRef.current = null;
      useStore.getState().endHistoryCoalesce();
    }
  }

  // Axis-aligned world-space bbox for a shape, given its owning sheet's
  // origin. Pens/lines expand by half their stroke width so thin strokes
  // still get caught by a marquee that skims them.
  function shapeWorldBBox(sh: Shape): { x: number; y: number; w: number; h: number } | null {
    const sheet = sheets.find((s) => s.id === sh.sheetId);
    const ox = sheet ? sheet.x : 0;
    const oy = sheet ? sheet.y : 0;
    if (
      sh.type === "rect" ||
      sh.type === "sticky" ||
      sh.type === "image" ||
      sh.type === "shape"
    ) {
      const w = sh.width;
      const h = sh.height;
      return { x: ox + sh.x, y: oy + sh.y, w, h };
    }
    if (sh.type === "line" || sh.type === "pen") {
      const pts = sh.points;
      if (!pts || pts.length < 2) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < pts.length; i += 2) {
        const px = pts[i];
        const py = pts[i + 1];
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
      // pad in WORLD units. World-unit strokes use strokeWidth directly; legacy
      // screen-px strokes need /zoom to convert their half-thickness to world.
      const pad =
        sh.strokeWidthUnit === "world"
          ? (sh.strokeWidth ?? 1) / 2
          : (sh.strokeWidth ?? 1) / 2 / zoom;
      return {
        x: ox + sh.x + minX - pad,
        y: oy + sh.y + minY - pad,
        w: maxX - minX + pad * 2,
        h: maxY - minY + pad * 2,
      };
    }
    return null;
  }

  function onMouseUp() {
    if (erasing) {
      pruneFullyErasedStrokes();
      setErasing(false);
      useStore.getState().endHistoryCoalesce();
    }
    // Commit the marquee: hit-test every visible/unlocked shape AND sheet
    // bbox against the rectangle; push the matches into the respective
    // multi-selections.
    if (marquee) {
      const minX = Math.min(marquee.x0, marquee.x1);
      const maxX = Math.max(marquee.x0, marquee.x1);
      const minY = Math.min(marquee.y0, marquee.y1);
      const maxY = Math.max(marquee.y0, marquee.y1);
      const tiny = maxX - minX < 2 && maxY - minY < 2;
      if (!tiny) {
        const matchedShapes: string[] = [];
        for (const sh of shapes) {
          if (!sh.visible || sh.locked) continue;
          const b = shapeWorldBBox(sh);
          if (!b) continue;
          if (b.x + b.w >= minX && b.x <= maxX && b.y + b.h >= minY && b.y <= maxY) {
            matchedShapes.push(sh.id);
          }
        }
        const matchedSheets: string[] = [];
        for (const sh of sheets) {
          if (sh.hidden || sh.locked) continue;
          // Sheets use AABB of their axis-aligned storage bbox.
          if (
            sh.x + sh.width >= minX &&
            sh.x <= maxX &&
            sh.y + sh.height >= minY &&
            sh.y <= maxY
          ) {
            matchedSheets.push(sh.id);
          }
        }
        setSelectedShapeIds(matchedShapes);
        setSelectedSheetIds(matchedSheets);
      }
      setMarquee(null);
      return;
    }

    // flush any in-flight imperative pan into the store
    if (isPanning) {
      if (drawRafRef.current !== null) {
        cancelAnimationFrame(drawRafRef.current);
        drawRafRef.current = null;
      }
      const committed = panRef.current;
      if (committed.x !== pan.x || committed.y !== pan.y) {
        setPan(committed);
      }
      if (overlayInnerRef.current) {
        overlayInnerRef.current.style.transform = "";
      }
    }
    setIsPanning(false);
    lastPan.current = null;
    // flush any RAF-coalesced draw patch to ensure the final point is committed
    if (drawRafRef.current !== null) {
      cancelAnimationFrame(drawRafRef.current);
      drawRafRef.current = null;
      const pending = pendingDrawPatchRef.current;
      pendingDrawPatchRef.current = null;
      if (pending) updateShape(pending.id, pending.patch);
    }
    if (drawing) {
      // normalize negative-sized rects/shapes
      if (drawing.type === "rect" || drawing.type === "shape") {
        const sh = useStore
          .getState()
          .shapes.find((s) => s.id === drawing.id) as RectShape | ShapeShape | undefined;
        if (sh) {
          let { x, y, width, height } = sh;
          if (width < 0) {
            x += width;
            width = -width;
          }
          if (height < 0) {
            y += height;
            height = -height;
          }
          updateShape(drawing.id, { x, y, width, height } as Partial<Shape>);
        }
      }
      // tiny shapes -> remove
      const sh = useStore
        .getState()
        .shapes.find((s) => s.id === drawing.id) as Shape | undefined;
      if (
        sh &&
        (sh.type === "rect" || sh.type === "shape") &&
        (Math.abs((sh as RectShape | ShapeShape).width) < 3 ||
          Math.abs((sh as RectShape | ShapeShape).height) < 3)
      ) {
        useStore.getState().deleteShape(sh.id);
      }
      // Zero-length lines (single click, no drag) get cleaned up so the
      // store doesn't accumulate invisible stubs that still render handle
      // circles at the click point.
      if (sh && sh.type === "line") {
        const pts = sh.points;
        const dx = pts[pts.length - 2] - pts[0];
        const dy = pts[pts.length - 1] - pts[1];
        if (Math.hypot(dx, dy) < 3) {
          useStore.getState().deleteShape(sh.id);
        } else if (sh.routing === "elbow" && pts.length === 4) {
          // Canonicalize new elbow lines to the 3-vertex explicit polyline
          // form so segment-midpoint handles can attach to discrete segments.
          const poly = canonicalizeOrthogonalPolyline(
            { x: pts[0], y: pts[1] },
            { x: pts[2], y: pts[3] },
            sh.elbowOrientation ?? "HV",
          );
          useStore.getState().updateShape(sh.id, { points: poly } as Partial<Shape>);
        }
      }
      setDrawing(null);
      useStore.getState().endHistoryCoalesce();
      if (tool !== "pen") {
        setTool("select");
      }
    }
  }

  return (
    <div className="absolute inset-0">
      <Rulers
        width={width}
        height={height}
        showH={showRulerH}
        showV={showRulerV}
        onRulerMouseDown={startRulerDrag}
      />
      <div
        className="absolute"
        style={{
          left: leftOffset,
          top: topOffset,
          width: stageW,
          height: stageH,
          background:
            "radial-gradient(circle at 50% 50%, var(--canvas-bg-1), var(--canvas-bg-2) 70%)",
          cursor:
            tool === "select"
              ? isPanning
                ? "grabbing"
                : "default"
              : tool === "pen"
              ? penCursor(penVariant, penVariants[penVariant].color)
              : tool === "eraser"
              ? eraserVariant === "stroke"
                ? "none"
                : "crosshair"
              : tool === "comment"
              ? commentCursor()
              : "crosshair",
        }}
      >
        <Stage
          ref={stageRef}
          width={stageW}
          height={stageH}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => {
            setEraserPos(null);
            onMouseUp();
          }}
        >
          {/* infinite-board grid */}
          <Layer listening={false}>
            <GridLayer
              width={stageW}
              height={stageH}
              pan={pan}
              zoom={zoom}
              color={theme["--grid-dot"]}
              mode={gridMode}
              gap={gridGap}
            />
          </Layer>

          {/* sheets & board — a single world-transform Group so pan-during-drag
              can be applied imperatively (see onMouseMove panning branch). */}
          <Layer>
            <Group
              ref={worldGroupRef}
              x={pan.x}
              y={pan.y}
              scaleX={zoom}
              scaleY={zoom}
            >
              {sheets.map((s) => {
                const isFocused =
                  s.id === selectedSheetId || selectedSheetIds.includes(s.id);
                const isActive = s.id === activeSheetId;
                const showHighlight = isFocused || isActive;
                const rotation = s.rotation ?? 0;
                const canManipulate =
                  tool === "select" && !s.locked && isFocused;
                // Center-origin transform: the visible top-left stays at
                // (s.x, s.y) when rotation is 0 because `x/y` is shifted by
                // the offset and the offset undoes the shift at rotation 0.
                const cx = s.x + s.width / 2;
                const cy = s.y + s.height / 2;
                return (
                  <Group
                    key={s.id}
                    x={cx}
                    y={cy}
                    offsetX={s.width / 2}
                    offsetY={s.height / 2}
                    rotation={rotation}
                    draggable={canManipulate}
                    opacity={s.hidden ? 0.35 : 1}
                    onClick={(e) => {
                      setActiveSheet(s.id);
                      const shift = (e.evt as MouseEvent)?.shiftKey;
                      if (shift) {
                        // Toggle this sheet's membership in the multi-selection.
                        const cur = useStore.getState().selectedSheetIds;
                        const next = cur.includes(s.id)
                          ? cur.filter((x) => x !== s.id)
                          : [...cur, s.id];
                        setSelectedSheetIds(next);
                      } else {
                        selectSheet(s.id);
                      }
                    }}
                    onTap={(e) => {
                      setActiveSheet(s.id);
                      // Touch/pointer events on Konva can carry modifier keys
                      // when the device has a keyboard attached. Cast to
                      // MouseEvent — shiftKey is undefined on plain touches.
                      const shift = (e.evt as unknown as MouseEvent)?.shiftKey;
                      if (shift) {
                        const cur = useStore.getState().selectedSheetIds;
                        const next = cur.includes(s.id)
                          ? cur.filter((x) => x !== s.id)
                          : [...cur, s.id];
                        setSelectedSheetIds(next);
                      } else {
                        selectSheet(s.id);
                      }
                    }}
                    onDragEnd={(e) => {
                      // Konva gives us the anchor (center) position; convert
                      // back to top-left for storage.
                      const nx = e.target.x() - s.width / 2;
                      const ny = e.target.y() - s.height / 2;
                      const dx = nx - s.x;
                      const dy = ny - s.y;
                      const st0 = useStore.getState();
                      const selSheetIds = st0.selectedSheetIds;
                      const selShapeIds = st0.selectedShapeIds;
                      const isGroup =
                        selSheetIds.includes(s.id) &&
                        selSheetIds.length + selShapeIds.length > 1;
                      useStore.getState().beginHistoryCoalesce(
                        `sheet-move-${s.id}-${uid()}`
                      );
                      if (isGroup) {
                        // Group move: every selected sheet + shape shifts by
                        // (dx, dy). Child shapes of a selected sheet are
                        // left alone so the sheet's own x/y change carries
                        // them — applying delta locally would double-move.
                        setSheetPosition(s.id, nx, ny);
                        useStore.setState((st) => {
                          const sheetIds = new Set(st.selectedSheetIds);
                          const shapeIds = new Set(st.selectedShapeIds);
                          return {
                            sheets: st.sheets.map((sh) =>
                              sheetIds.has(sh.id) && sh.id !== s.id && !sh.locked
                                ? ({ ...sh, x: sh.x + dx, y: sh.y + dy } as Sheet)
                                : sh
                            ),
                            shapes: st.shapes.map((sh) => {
                              if (!shapeIds.has(sh.id) || sh.locked) return sh;
                              if (sheetIds.has(sh.sheetId)) return sh;
                              return ({ ...sh, x: sh.x + dx, y: sh.y + dy } as Shape);
                            }),
                          };
                        });
                      } else {
                        // Solo sheet move: commit sheet + compensate each
                        // child shape's local coords by -delta so its WORLD
                        // position is unchanged.
                        setSheetPosition(s.id, nx, ny);
                        if (dx !== 0 || dy !== 0) {
                          useStore.setState((st) => ({
                            shapes: st.shapes.map((sh) =>
                              sh.sheetId === s.id
                                ? ({ ...sh, x: sh.x - dx, y: sh.y - dy } as Shape)
                                : sh
                            ),
                          }));
                        }
                      }
                      useStore.getState().endHistoryCoalesce();
                    }}
                  >
                    {/* page */}
                    <Rect
                      width={s.width}
                      height={s.height}
                      fill={s.background}
                      stroke={
                        isFocused
                          ? theme["--accent"]
                          : isActive
                          ? theme["--accent"]
                          : theme["--border"]
                      }
                      strokeWidth={(showHighlight ? 2 : 1) / zoom}
                      cornerRadius={6 / zoom}
                    />
                    {/* margin guides */}
                    <MarginGuides sheet={s} zoom={zoom} accent={theme["--accent"]} />
                    {/* borders */}
                    <SheetBorders sheet={s} />
                    {/* Sheet name + action bar lives in the HTML overlay
                        (SheetHeadersOverlay) so the name is editable and the
                        icons (lock/hide/duplicate/copy/cut/paste/export) are
                        real buttons, not Konva shapes. */}
                    {/* Shape rendering is NOT nested here — it's a sibling
                        group below, so dragging this (chrome) Group doesn't
                        also translate the shapes. See the second sheets.map
                        below where the shapes render with a matching
                        transform. */}
                    {/* Rotation handle — only when the sheet is selected and
                        unlocked. The Konva-draggable circle is rendered in
                        the sheet's local space so it naturally spins with it. */}
                    {canManipulate && (
                      <RotationHandle
                        sheet={s}
                        zoom={zoom}
                        accent={theme["--accent"]}
                        onRotate={(deg) => setSheetRotation(s.id, deg)}
                      />
                    )}
                  </Group>
                );
              })}

              {/* Per-sheet shape layer. Same center-origin transform as the
                  sheet chrome so positions match, but NOT draggable — when
                  the user drags the sheet chrome Group above, shapes here
                  stay visually put because they aren't its children. On
                  sheet drop, the sheet's onDragEnd compensates each shape's
                  local coords so its world position is unchanged. */}
              {sheets.map((s) => {
                const rotation = s.rotation ?? 0;
                const cx = s.x + s.width / 2;
                const cy = s.y + s.height / 2;
                const list = shapesBySheet.get(s.id) || [];
                if (list.length === 0) return null;
                return (
                  <Group
                    key={`shapes-${s.id}`}
                    x={cx}
                    y={cy}
                    offsetX={s.width / 2}
                    offsetY={s.height / 2}
                    rotation={rotation}
                    opacity={s.hidden ? 0.35 : 1}
                    listening={!s.locked}
                  >
                    {list.map((sh) => (
                      <ShapeNode
                        key={sh.id}
                        shape={sh}
                        selected={
                          selectedShapeId === sh.id ||
                          selectedShapeIds.includes(sh.id)
                        }
                        isDrawing={drawing?.id === sh.id}
                        onSelect={(
                          e?: KonvaEventObject<MouseEvent | TouchEvent>
                        ) => {
                          // A shape is interactable only when its parent sheet
                          // AND the shape itself are unlocked. Locking from the
                          // sidebar flips `sh.locked` and has to propagate here
                          // or drag/select would still fire on locked shapes.
                          if (tool === "select" && !s.locked && !sh.locked)
                            onShapeClickSelect(sh.id, e);
                        }}
                        onChange={(patch) => updateShape(sh.id, patch)}
                        draggable={tool === "select" && !s.locked && !sh.locked}
                        onGroupDragStart={() => onShapeGroupDragStart(sh.id)}
                        onGroupDragMove={(nx, ny) =>
                          onShapeGroupDragMove(sh.id, nx, ny)
                        }
                        onGroupDragEnd={onShapeGroupDragEnd}
                      />
                    ))}
                  </Group>
                );
              })}

              {/* free board layer — shapes without a sheet */}
              {(shapesBySheet.get("board") || []).map((sh) => (
                <ShapeNode
                  key={sh.id}
                  shape={sh}
                  selected={
                    selectedShapeId === sh.id ||
                    selectedShapeIds.includes(sh.id)
                  }
                  isDrawing={drawing?.id === sh.id}
                  onSelect={(
                    e?: KonvaEventObject<MouseEvent | TouchEvent>
                  ) => {
                    if (tool === "select") onShapeClickSelect(sh.id, e);
                  }}
                  onChange={(patch) => updateShape(sh.id, patch)}
                  draggable={tool === "select"}
                  onGroupDragStart={() => onShapeGroupDragStart(sh.id)}
                  onGroupDragMove={(nx, ny) =>
                    onShapeGroupDragMove(sh.id, nx, ny)
                  }
                  onGroupDragEnd={onShapeGroupDragEnd}
                />
              ))}
              {/* Comment pins — rendered above shapes but below selection
                  chrome so they remain visible regardless of what's
                  currently selected. Lives inside the world <Group> so pan
                  / zoom / sheet rotation come for free. */}
              <CommentPinLayer zoom={zoom} />
              {/* Marquee overlay — blue semi-transparent rect while dragging. */}
              {marquee && (
                <Rect
                  x={Math.min(marquee.x0, marquee.x1)}
                  y={Math.min(marquee.y0, marquee.y1)}
                  width={Math.abs(marquee.x1 - marquee.x0)}
                  height={Math.abs(marquee.y1 - marquee.y0)}
                  fill={theme["--accent"] + "22"}
                  stroke={theme["--accent"]}
                  strokeWidth={1 / zoom}
                  dash={[4 / zoom, 3 / zoom]}
                  listening={false}
                />
              )}
              {/* Resize/rotate handles for the new "shape" type. The effect
                  above keeps `nodes` in sync with the selection. */}
              <Transformer
                ref={transformerRef}
                rotateEnabled
                keepRatio={false}
                ignoreStroke
                anchorSize={8}
                borderStroke={theme["--accent"]}
                anchorStroke={theme["--accent"]}
                anchorFill="#ffffff"
                enabledAnchors={[
                  "top-left",
                  "top-center",
                  "top-right",
                  "middle-left",
                  "middle-right",
                  "bottom-left",
                  "bottom-center",
                  "bottom-right",
                ]}
                onTransformEnd={() => {
                  const tr = transformerRef.current;
                  if (!tr) return;
                  const nodes = tr.nodes();
                  for (const node of nodes) {
                    const id = node.id();
                    const sh = useStore
                      .getState()
                      .shapes.find((s) => s.id === id);
                    if (!sh || sh.type !== "shape") continue;
                    const sx = Math.abs(node.scaleX());
                    const sy = Math.abs(node.scaleY());
                    const newW = Math.max(3, sh.width * sx);
                    const newH = Math.max(3, sh.height * sy);
                    const renderer = KIND_RENDERER[sh.kind];
                    const isCenter =
                      renderer === "ellipse" ||
                      renderer === "polygon" ||
                      renderer === "star";
                    const newX = isCenter ? node.x() - newW / 2 : node.x();
                    const newY = isCenter ? node.y() - newH / 2 : node.y();
                    node.scaleX(1);
                    node.scaleY(1);
                    updateShape(id, {
                      x: newX,
                      y: newY,
                      width: newW,
                      height: newH,
                      rotation: node.rotation(),
                    } as Partial<Shape>);
                  }
                }}
              />
              {/* Ruler guides — rendered inside the world transform so they
                  pan/zoom with content. Lives on top of shapes+transformer
                  so the line stays visible across everything. */}
              <GuideLayer
                guides={guides}
                draft={draftGuide}
                viewportWorldBounds={{
                  minX: -pan.x / zoom,
                  minY: -pan.y / zoom,
                  maxX: (stageW - pan.x) / zoom,
                  maxY: (stageH - pan.y) / zoom,
                }}
                zoom={zoom}
                selectedGuideId={selectedGuideId}
                deleteHoverId={deleteHoverGuideId}
                snapIndicator={snapIndicator}
                activeRepositionId={
                  guideDragRef.current?.mode === "reposition"
                    ? guideDragRef.current.id
                    : null
                }
                onGuideMouseDown={(id, e) =>
                  startGuideReposition(id, e.evt as MouseEvent)
                }
              />
            </Group>
          </Layer>
        </Stage>
        {/* HTML overlay: "+" between adjacent sheets, and one to append at the end.
            The inner ref is translate3d'd imperatively during pan-drag so the
            overlay follows the Konva stage without any React re-render. */}
        <InterSheetAddOverlay innerRef={overlayInnerRef} />
        {/* Live eraser circle — tracks pointer. eraserSize is in WORLD units
            (Canva-style), so the cursor visually scales with zoom to match
            the actual erase radius. Floored and capped so it stays visible at
            extreme low zoom and doesn't cover the viewport at extreme high
            zoom + large size. The hit-test always uses the true world radius. */}
        {tool === "eraser" && eraserVariant === "stroke" && eraserPos && (() => {
          const displaySize = Math.min(
            MAX_ERASER_SCREEN_PX,
            Math.max(MIN_ERASER_SCREEN_PX, worldToScreen(eraserSize, zoom))
          );
          return (
            <div
              className="pointer-events-none absolute"
              style={{
                left: eraserPos.x - displaySize / 2,
                top: eraserPos.y - displaySize / 2,
                width: displaySize,
                height: displaySize,
                borderRadius: "50%",
                border: "1.5px solid rgba(255,255,255,0.95)",
                boxShadow:
                  "0 0 0 1px rgba(0,0,0,0.65), inset 0 0 0 1px rgba(0,0,0,0.35)",
                background: "rgba(255,255,255,0.06)",
              }}
            />
          );
        })()}
      </div>
    </div>
  );
}

// Overlay subscribes to its own slice of the store so it doesn't re-render on
// unrelated updates (e.g. drawing shapes). Wrapped in React.memo so it only
// re-runs when its ref prop changes (never). Renders:
//   - the "+" ghost sheet at the end of the row
//   - per-sheet header bars (editable name + lock/hide/dup/copy/cut/paste/export)
const InterSheetAddOverlay = memo(function InterSheetAddOverlay({
  innerRef,
}: {
  innerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const sheets = useStore((s) => s.sheets);
  const pan = useStore((s) => s.pan);
  const zoom = useStore((s) => s.zoom);
  const addSheet = useStore((s) => s.addSheet);
  if (sheets.length === 0) return null;
  const last = sheets[sheets.length - 1];
  const APPEND_OFFSET_PX = 32;
  const ghostScreenH = Math.max(120, last.height * zoom);
  const ghostScreenW = Math.max(90, ghostScreenH * (last.width / last.height));
  const appendLeft = (last.x + last.width) * zoom + pan.x + APPEND_OFFSET_PX;
  const appendTop = last.y * zoom + pan.y + (last.height * zoom - ghostScreenH) / 2;
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div
        ref={innerRef}
        className="absolute inset-0"
        style={{ willChange: "transform" }}
      >
        {/* Per-sheet header bars. Positioned in screen space above each
            sheet's axis-aligned bbox top. Kept axis-aligned even when the
            sheet itself is rotated — easier to click than a rotated header. */}
        {sheets.map((s) => (
          <SheetHeader key={`hdr-${s.id}`} sheet={s} zoom={zoom} pan={pan} />
        ))}
        {/* append-at-end ghost-sheet placeholder */}
        <button
          key="append-end"
          className="pointer-events-auto absolute grid place-items-center rounded-md border-2 border-dashed border-brand-500/60 bg-brand-500/5 text-brand-500 hover:border-brand-500 hover:bg-brand-500/10 transition-colors"
          style={{
            left: appendLeft,
            top: appendTop,
            width: ghostScreenW,
            height: ghostScreenH,
          }}
          onClick={() => addSheet()}
          title="Add sheet to the right"
        >
          <Plus size={28} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
});

// Editable name + action icons that live just above each sheet. Subscribes to
// its own sheet-specific slice so the other sheets' rows don't re-render
// when one is toggled / renamed.
function SheetHeader({
  sheet,
  zoom,
  pan,
}: {
  sheet: Sheet;
  zoom: number;
  pan: { x: number; y: number };
}) {
  const renameSheet = useStore((s) => s.renameSheet);
  const toggleSheetLocked = useStore((s) => s.toggleSheetLocked);
  const toggleSheetHidden = useStore((s) => s.toggleSheetHidden);
  const duplicateSheet = useStore((s) => s.duplicateSheet);
  const copySheetToClip = useStore((s) => s.copySheetToClip);
  const pasteSheetFromClip = useStore((s) => s.pasteSheetFromClip);
  const deleteSheet = useStore((s) => s.deleteSheet);
  const selectSheet = useStore((s) => s.selectSheet);
  const totalSheets = useStore((s) => s.sheets.length);
  const clipHasSheet = useStore((s) => !!s.clipboard.sheet);
  const selectedSheetId = useStore((s) => s.selectedSheetId);
  const activeSheetId = useStore((s) => s.activeSheetId);
  const isFocused =
    sheet.id === selectedSheetId || sheet.id === activeSheetId;

  // Local draft so the input stays responsive without hitting history on every
  // keystroke. Committed on Enter/blur.
  const [draft, setDraft] = useState(sheet.name);
  // Reset the draft when the sheet renames externally (undo/redo, sidebar…).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setDraft(sheet.name), [sheet.name]);
  // More-options popover state. Only one can be open at a time per sheet.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    // Close when clicking anywhere outside the popover wrapper.
    function onDocDown(ev: MouseEvent) {
      if (!menuWrapRef.current) return;
      if (!menuWrapRef.current.contains(ev.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [menuOpen]);

  const left = sheet.x * zoom + pan.x;
  // Sit 22px above the sheet bbox — matches the old Konva label's baseline
  // so the header doesn't visually dominate the sheet at low zoom.
  const top = sheet.y * zoom + pan.y - 22;

  function commitName() {
    if (draft.trim() && draft !== sheet.name) renameSheet(sheet.id, draft);
    else setDraft(sheet.name);
  }

  function doExport() {
    const stage = (window as unknown as { __spaceshow_stage?: Konva.Stage }).__spaceshow_stage;
    const z = useStore.getState().zoom;
    const p = useStore.getState().pan;
    if (stage) exportSheetAsImage(stage, sheet, "png", z, p);
  }

  function doCut() {
    // Cut = copy-to-clipboard + delete. Guarded by the same "last sheet"
    // rule as the keyboard shortcut so you can't orphan the canvas.
    if (totalSheets <= 1) return;
    copySheetToClip(sheet.id);
    deleteSheet(sheet.id);
  }

  function doPaste() {
    // Select this sheet first so pasteSheetFromClip inserts right after it.
    selectSheet(sheet.id);
    pasteSheetFromClip();
  }

  return (
    <div
      className="pointer-events-auto absolute flex items-center gap-0.5 px-1 h-[18px] rounded text-ink-300 text-[11px] leading-none w-max hover:bg-ink-900/60"
      style={{ left, top }}
      onMouseDown={(e) => {
        // Any mousedown on the header (label, icon, input) selects the sheet
        // so the rest of the UI (sidebars, transformer) reacts to it.
        selectSheet(sheet.id);
        e.stopPropagation();
      }}
      onWheel={(e) => e.stopPropagation()}
    >
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          selectSheet(sheet.id);
          e.currentTarget.select();
        }}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(sheet.name);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        title="Rename sheet"
        size={Math.max(6, draft.length + 1)}
        className={`bg-transparent outline-none px-0.5 rounded focus:bg-ink-800 focus:text-ink-100 ${
          isFocused ? "text-brand-400 font-semibold" : ""
        } ${sheet.hidden ? "italic opacity-70" : ""}`}
      />
      <HeaderBtn
        title={sheet.locked ? "Unlock sheet" : "Lock sheet"}
        onClick={() => toggleSheetLocked(sheet.id)}
      >
        {sheet.locked ? <Lock size={10} /> : <Unlock size={10} />}
      </HeaderBtn>
      <HeaderBtn
        title={sheet.hidden ? "Unhide sheet" : "Hide sheet"}
        onClick={() => toggleSheetHidden(sheet.id)}
      >
        {sheet.hidden ? <EyeOff size={10} /> : <Eye size={10} />}
      </HeaderBtn>
      {/* More-options (3-dot) menu — duplicate / copy / cut / paste / export */}
      <div ref={menuWrapRef} className="relative">
        <HeaderBtn
          title="More options"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreHorizontal size={10} />
        </HeaderBtn>
        {menuOpen && (
          <div
            className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-md border border-ink-700 bg-ink-900/95 text-ink-100 shadow-lg py-1 backdrop-blur-sm"
            role="menu"
          >
            <MenuItem
              icon={<CopyPlus size={13} />}
              label="Duplicate"
              onClick={() => {
                duplicateSheet(sheet.id);
                setMenuOpen(false);
              }}
            />
            <MenuItem
              icon={<Copy size={13} />}
              label="Copy"
              onClick={() => {
                copySheetToClip(sheet.id);
                setMenuOpen(false);
              }}
            />
            <MenuItem
              icon={<Scissors size={13} />}
              label="Cut"
              disabled={totalSheets <= 1}
              onClick={() => {
                doCut();
                setMenuOpen(false);
              }}
            />
            <MenuItem
              icon={<ClipboardPaste size={13} />}
              label="Paste"
              disabled={!clipHasSheet}
              onClick={() => {
                doPaste();
                setMenuOpen(false);
              }}
            />
            <div className="h-px bg-ink-700 my-1" />
            <MenuItem
              icon={<Download size={13} />}
              label="Export as PNG"
              onClick={() => {
                doExport();
                setMenuOpen(false);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function HeaderBtn({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="grid place-items-center w-[14px] h-[14px] rounded hover:bg-ink-700/80 text-ink-400 hover:text-ink-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-ink-700/70 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      <span className="text-ink-300">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// Rotation handle rendered inside the sheet's rotated Group. The handle's
// local position stays canonical (above top-center); drag is tracked by
// listening to stage-level pointer events relative to the sheet's center.
function RotationHandle({
  sheet,
  zoom,
  accent,
  onRotate,
}: {
  sheet: Sheet;
  zoom: number;
  accent: string;
  onRotate: (deg: number) => void;
}) {
  const handleGap = 28 / zoom;
  const hx = sheet.width / 2;
  const hy = -handleGap;

  function onStart(e: KonvaEventObject<MouseEvent | TouchEvent>) {
    e.cancelBubble = true;
    const stage = e.target.getStage();
    if (!stage) return;
    const group = e.target.getParent();
    if (!group) return;
    const centerAbs = group.getAbsolutePosition();
    const p0 = stage.getPointerPosition();
    if (!p0) return;
    const startAngle =
      (Math.atan2(p0.y - centerAbs.y, p0.x - centerAbs.x) * 180) / Math.PI;
    const startDeg = sheet.rotation ?? 0;

    // Arrow fns capture the narrowed `stage` (non-null after the early return);
    // a `function` declaration here would re-widen it to `Stage | null`.
    const readAngle = () => {
      const p = stage.getPointerPosition();
      if (!p) return null;
      return (Math.atan2(p.y - centerAbs.y, p.x - centerAbs.x) * 180) / Math.PI;
    };
    const onMove = (ev: KonvaEventObject<MouseEvent | TouchEvent>) => {
      const a = readAngle();
      if (a == null) return;
      let next = startDeg + (a - startAngle);
      // Snap to 15° increments when Shift is held.
      const ne = ev?.evt;
      const shift =
        ne && "shiftKey" in ne && (ne as MouseEvent).shiftKey;
      if (shift) next = Math.round(next / 15) * 15;
      onRotate(next);
    };
    const onEnd = () => {
      stage.off("mousemove.sheetrot touchmove.sheetrot");
      stage.off("mouseup.sheetrot touchend.sheetrot mouseleave.sheetrot");
    };
    stage.on("mousemove.sheetrot touchmove.sheetrot", onMove);
    stage.on("mouseup.sheetrot touchend.sheetrot mouseleave.sheetrot", onEnd);
  }

  return (
    <Group listening>
      {/* Connector line from sheet top edge up to the handle */}
      <Line
        points={[hx, 0, hx, hy]}
        stroke={accent}
        strokeWidth={1 / zoom}
        dash={[3 / zoom, 3 / zoom]}
        listening={false}
      />
      {/* Invisible hit-pad for easier grabbing */}
      <Circle
        x={hx}
        y={hy}
        radius={14 / zoom}
        fill="rgba(0,0,0,0)"
        onMouseDown={onStart}
        onTouchStart={onStart}
        onDblClick={() => onRotate(0)}
        onDblTap={() => onRotate(0)}
      />
      {/* Visible handle */}
      <Circle
        x={hx}
        y={hy}
        radius={6 / zoom}
        fill={accent}
        stroke="white"
        strokeWidth={1.5 / zoom}
        listening={false}
      />
    </Group>
  );
}

function MarginGuides({
  sheet,
  zoom,
  accent,
}: {
  sheet: Sheet;
  zoom: number;
  accent: string;
}) {
  const sw = 1 / zoom;
  const dash = [6 / zoom, 4 / zoom];
  const lines: React.ReactNode[] = [];
  const m = sheet.margins;
  if (typeof m.top === "number") {
    lines.push(
      <Line
        key="mt"
        points={[0, m.top, sheet.width, m.top]}
        stroke={accent}
        strokeWidth={sw}
        dash={dash}
        opacity={0.4}
        listening={false}
      />
    );
  }
  if (typeof m.bottom === "number") {
    const y = sheet.height - m.bottom;
    lines.push(
      <Line
        key="mb"
        points={[0, y, sheet.width, y]}
        stroke={accent}
        strokeWidth={sw}
        dash={dash}
        opacity={0.4}
        listening={false}
      />
    );
  }
  if (typeof m.left === "number") {
    lines.push(
      <Line
        key="ml"
        points={[m.left, 0, m.left, sheet.height]}
        stroke={accent}
        strokeWidth={sw}
        dash={dash}
        opacity={0.4}
        listening={false}
      />
    );
  }
  if (typeof m.right === "number") {
    const x = sheet.width - m.right;
    lines.push(
      <Line
        key="mr"
        points={[x, 0, x, sheet.height]}
        stroke={accent}
        strokeWidth={sw}
        dash={dash}
        opacity={0.4}
        listening={false}
      />
    );
  }
  return <>{lines}</>;
}

function dashFor(style: LineStyle, weight: number): number[] | undefined {
  if (style === "solid" || style === "double") return undefined;
  if (style === "dotted") return [1, Math.max(2, weight * 1.5)];
  if (style === "dashed") return [Math.max(4, weight * 3), Math.max(3, weight * 2)];
  return undefined;
}

function SheetBorders({ sheet }: { sheet: Sheet }) {
  const b = sheet.border;
  if (b.weight <= 0) return null;
  const w = sheet.width;
  const h = sheet.height;
  const offsets = b.offsets ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const opacity = typeof b.opacity === "number" ? b.opacity : 1;
  const radius = b.radius ?? { tl: 0, tr: 0, bl: 0, br: 0 };
  const lines: React.ReactNode[] = [];
  const dash = dashFor(b.style, b.weight);

  // Per-side edge position after offset (inset from the sheet edge by `offsets[side]` px).
  const top = offsets.top;
  const right = w - offsets.right;
  const bottom = h - offsets.bottom;
  const left = offsets.left;

  // When all four sides are enabled and any corner has radius, render as a
  // single rounded rectangle so the corners arc smoothly. Mixed/partial sides
  // don't have a well-defined corner, so they fall through to the line path.
  const allSidesOn = b.sides.top && b.sides.right && b.sides.bottom && b.sides.left;
  const anyRadius = radius.tl > 0 || radius.tr > 0 || radius.bl > 0 || radius.br > 0;
  if (allSidesOn && anyRadius) {
    const rectW = Math.max(0, right - left);
    const rectH = Math.max(0, bottom - top);
    // Clamp each radius to half the shorter side so corners don't overlap.
    const maxR = Math.max(0, Math.min(rectW, rectH) / 2);
    const cr = [
      Math.min(radius.tl, maxR),
      Math.min(radius.tr, maxR),
      Math.min(radius.br, maxR),
      Math.min(radius.bl, maxR),
    ];
    if (b.style === "double") {
      const outerW = Math.max(1, b.weight);
      const innerW = Math.max(1, Math.round(b.weight * 0.45));
      const gap = Math.max(2, b.weight + 1);
      return (
        <>
          <Rect
            x={left}
            y={top}
            width={rectW}
            height={rectH}
            stroke={b.color}
            strokeWidth={outerW}
            cornerRadius={cr}
            opacity={opacity}
            listening={false}
          />
          <Rect
            x={left + gap}
            y={top + gap}
            width={Math.max(0, rectW - gap * 2)}
            height={Math.max(0, rectH - gap * 2)}
            stroke={b.color}
            strokeWidth={innerW}
            cornerRadius={cr.map((v) => Math.max(0, v - gap))}
            opacity={opacity}
            listening={false}
          />
        </>
      );
    }
    return (
      <Rect
        x={left}
        y={top}
        width={rectW}
        height={rectH}
        stroke={b.color}
        strokeWidth={b.weight}
        cornerRadius={cr}
        dash={dash}
        opacity={opacity}
        listening={false}
      />
    );
  }

  function addSide(key: string, points: number[], offsetDir?: { x: number; y: number }) {
    if (b.style === "double") {
      // Outer line is thicker than inner. Gap scales with weight.
      const outerW = Math.max(1, b.weight);
      const innerW = Math.max(1, Math.round(b.weight * 0.45));
      const gap = Math.max(2, b.weight + 1);
      const sx = (offsetDir?.x ?? 0) * gap;
      const sy = (offsetDir?.y ?? 0) * gap;
      // Outer (flush with the offset edge)
      lines.push(
        <Line
          key={`${key}-outer`}
          points={points}
          stroke={b.color}
          strokeWidth={outerW}
          opacity={opacity}
          listening={false}
          lineCap="butt"
        />
      );
      // Inner (nudged toward the sheet interior)
      lines.push(
        <Line
          key={`${key}-inner`}
          points={points.map((v, i) => (i % 2 === 0 ? v + sx : v + sy))}
          stroke={b.color}
          strokeWidth={innerW}
          opacity={opacity}
          listening={false}
          lineCap="butt"
        />
      );
    } else {
      lines.push(
        <Line
          key={key}
          points={points}
          stroke={b.color}
          strokeWidth={b.weight}
          dash={dash}
          opacity={opacity}
          listening={false}
          lineCap="butt"
        />
      );
    }
  }

  if (b.sides.top) addSide("bt", [left, top, right, top], { x: 0, y: 1 });
  if (b.sides.right) addSide("br", [right, top, right, bottom], { x: -1, y: 0 });
  if (b.sides.bottom) addSide("bb", [left, bottom, right, bottom], { x: 0, y: -1 });
  if (b.sides.left) addSide("bl", [left, top, left, bottom], { x: 1, y: 0 });

  return <>{lines}</>;
}

function GridLayer({
  width,
  height,
  pan,
  zoom,
  color,
  mode,
  gap,
}: {
  width: number;
  height: number;
  pan: { x: number; y: number };
  zoom: number;
  color: string;
  mode: "plain" | "dots" | "lines";
  gap: number;
}) {
  if (mode === "plain") return null;
  const step = gap * zoom;
  if (step < 8) return null;
  const startX = ((pan.x % step) + step) % step;
  const startY = ((pan.y % step) + step) % step;

  if (mode === "lines") {
    const lines: React.ReactNode[] = [];
    for (let x = startX; x < width; x += step) {
      lines.push(
        <Line
          key={`vx-${x}`}
          points={[x, 0, x, height]}
          stroke={color}
          strokeWidth={1}
          listening={false}
        />
      );
    }
    for (let y = startY; y < height; y += step) {
      lines.push(
        <Line
          key={`hy-${y}`}
          points={[0, y, width, y]}
          stroke={color}
          strokeWidth={1}
          listening={false}
        />
      );
    }
    return <>{lines}</>;
  }

  // dots
  const dots: React.ReactNode[] = [];
  for (let x = startX; x < width; x += step) {
    for (let y = startY; y < height; y += step) {
      dots.push(
        <Rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width={1.5}
          height={1.5}
          fill={color}
          listening={false}
        />
      );
    }
  }
  return <>{dots}</>;
}

function ShapeNode({
  shape,
  selected,
  isDrawing,
  onSelect,
  onChange,
  draggable,
  onGroupDragStart,
  onGroupDragMove,
  onGroupDragEnd,
}: {
  shape: Shape;
  selected: boolean;
  /** True while the user is still holding down the mouse to draw this shape.
   *  Lines in this state render as a straight preview from start pivot to
   *  current pivot regardless of their final `routing`; the elbow/curved
   *  geometry snaps in on mouseup. Keeps the draw gesture from showing a
   *  jittering corner as the mouse moves. */
  isDrawing?: boolean;
  onSelect: (e?: KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onChange: (patch: Partial<Shape>) => void;
  draggable: boolean;
  onGroupDragStart?: () => void;
  onGroupDragMove?: (nx: number, ny: number) => void;
  onGroupDragEnd?: () => void;
}) {
  // Needed to convert legacy screen-px strokeWidths back into world units for
  // the Line branch. New world-unit strokes render directly.
  const zoom = useStore((s) => s.zoom);
  // Stop drag events from bubbling to the parent sheet Group — otherwise
  // the sheet's onDragEnd receives `e.target` = this shape and would try to
  // relocate the sheet to the shape's coordinates.
  const handleDragStart = (e: KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    onGroupDragStart?.();
  };
  const handleDragMove = (e: KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true;
    onGroupDragMove?.(e.target.x(), e.target.y());
  };
  const handleDragEndWith = (
    e: KonvaEventObject<DragEvent>,
    patch: Partial<Shape>
  ) => {
    e.cancelBubble = true;
    onChange(patch);
    onGroupDragEnd?.();
  };
  const accent =
    typeof window !== "undefined"
      ? getComputedStyle(document.documentElement)
          .getPropertyValue("--accent")
          .trim() || "#0d9488"
      : "#0d9488";
  const stroke = selected ? accent : undefined;
  const strokeWidth = selected ? 2 : 0;

  if (shape.type === "rect") {
    return (
      <Rect
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        fill={shape.fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        cornerRadius={2}
        draggable={draggable}
        onClick={onSelect}
        onTap={onSelect}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={(e) =>
          handleDragEndWith(e, { x: e.target.x(), y: e.target.y() })
        }
      />
    );
  }
  if (shape.type === "shape") {
    return (
      <UnifiedShapeNode
        shape={shape}
        selected={selected}
        accent={accent}
        draggable={draggable}
        onSelect={onSelect}
        onDragStartProxy={handleDragStart}
        onDragMoveProxy={handleDragMove}
        onDragEndProxy={(e: KonvaEventObject<DragEvent>, patch: Partial<Shape>) => handleDragEndWith(e, patch)}
      />
    );
  }
  if (shape.type === "pen") {
    return (
      <PenShapeNode
        shape={shape}
        draggable={draggable}
        onSelect={onSelect}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={(e) =>
          handleDragEndWith(e, { x: e.target.x(), y: e.target.y() })
        }
      />
    );
  }
  if (shape.type === "line") {
    // World-unit strokes: Konva's group scale handles zoom; render strokeWidth
    // directly. Legacy screen-px strokes: divide by zoom so the group scale
    // cancels out, leaving constant screen thickness.
    const renderStrokeWidth =
      shape.strokeWidthUnit === "world"
        ? (shape.strokeWidth ?? 1)
        : (shape.strokeWidth ?? 1) / zoom;
    // During the draw gesture, force a straight preview: elbow corners and
    // Bézier controls only snap in on mouseup. Without this, the elbow
    // corner jumps with every mouse move and feels like a flickering Z.
    const routing = isDrawing ? "straight" : (shape.routing ?? "straight");
    const commonProps = {
      stroke: shape.stroke,
      strokeWidth: renderStrokeWidth,
      opacity: shape.opacity ?? 1,
      lineCap: "round" as const,
      lineJoin: "round" as const,
      onClick: onSelect,
      onTap: onSelect,
    };
    const primary =
      routing === "curved" && shape.points.length >= 4 ? (
        (() => {
          const n = shape.points.length;
          const s = { x: shape.points[0], y: shape.points[1] };
          const e = { x: shape.points[n - 2], y: shape.points[n - 1] };
          const { d } = computeCurvedPath(s, e, shape.curvature ?? 0.3);
          return <KPath data={d} {...commonProps} />;
        })()
      ) : routing === "elbow" ? (
        (() => {
          // Canva-style rounded-corner elbow. The `isDrawing` short-circuit
          // above forces routing to "straight" during the draw gesture, so
          // this branch only runs for finalized elbow shapes.
          const polyline =
            shape.points.length >= 6
              ? shape.points
              : computeElbowPath(
                  shape.points,
                  shape.elbowOrientation ?? "HV",
                );
          const d = buildRoundedElbowPath(polyline, 12 / zoom);
          return <KPath data={d} {...commonProps} />;
        })()
      ) : (
        <Line points={shape.points} {...commonProps} />
      );
    if (!selected || isDrawing) return primary;
    return (
      <>
        {primary}
        <LineHandles shape={shape} zoom={zoom} accent={accent} />
      </>
    );
  }
  if (shape.type === "sticky") {
    return (
      <Group
        x={shape.x}
        y={shape.y}
        draggable={draggable}
        onClick={onSelect}
        onTap={onSelect}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={(e) =>
          handleDragEndWith(e, { x: e.target.x(), y: e.target.y() })
        }
      >
        <Rect
          width={shape.width}
          height={shape.height}
          fill={shape.fill}
          stroke={stroke ?? "#e0c060"}
          strokeWidth={selected ? 2 : 1}
          cornerRadius={4}
          shadowColor="rgba(0,0,0,0.25)"
          shadowBlur={6}
          shadowOffset={{ x: 0, y: 2 }}
        />
        <Text
          text={shape.text}
          x={10}
          y={10}
          width={shape.width - 20}
          height={shape.height - 20}
          fontSize={16}
          fill="#1c1e25"
        />
      </Group>
    );
  }
  if (shape.type === "image") {
    return (
      <UrlImage
        shape={shape}
        selected={selected}
        onSelect={onSelect}
        onChange={onChange}
        draggable={draggable}
        onDragStartProxy={handleDragStart}
        onDragMoveProxy={handleDragMove}
        onDragEndProxy={(e: KonvaEventObject<DragEvent>, patch: Partial<Shape>) => handleDragEndWith(e, patch)}
      />
    );
  }
  return null;
}

/**
 * Pen stroke renderer. When the stroke has `eraseMarks`, draws destination-out
 * circles over the Line inside a cached Konva Group so the holes are scoped
 * to this shape only (won't erase the sheet or any other shapes below). The
 * cache is reset whenever marks or rendered style change, so new holes appear
 * live during a stroke-erase drag.
 */

/**
 * LineHandles — draggable handles for a selected LineShape.
 *
 * Renders as a sibling of the <Line>/<KPath>, so it lives in the same
 * parent transform (sheet-local for shapes on a sheet, world for board
 * shapes). All positions are in that coordinate space.
 *
 * Straight & curved lines show two endpoint handles (free drag) and, for
 * curved, a curvature affordance at `chordMid + N·k·L`.
 *
 * Elbow lines use Canva-style segment-drag semantics:
 *   - Each rendered segment gets a midpoint handle, axis-constrained
 *     perpendicular to its axis.
 *   - Dragging the first or last segment inserts a new orthogonal stub
 *     adjacent to the endpoint so the endpoint stays anchored.
 *   - Middle segment drags translate the segment; neighbour segments
 *     shorten / extend along their own axes.
 *   - Endpoint handles remain but are locked to the adjacent segment's
 *     axis (free-axis endpoint drag with auto-inserted corner is a v2).
 *
 * Each drag coalesces history under a key that includes the handle id
 * PLUS a per-gesture UUID, so rapid re-drags of the same handle always
 * yield distinct undo steps.
 */
function LineHandles({
  shape,
  zoom,
  accent,
}: {
  shape: LineShape;
  zoom: number;
  accent: string;
}) {
  const updateShape = useStore((s) => s.updateShape);
  const routing = shape.routing ?? "straight";
  const pts = shape.points;
  const n = pts.length;

  // Drag-gesture state for elbow segment handles. Captured on drag start so
  // onDragMove can replay the insert/translate operation from the original
  // polyline every frame — keeps the math idempotent regardless of how many
  // times onDragMove fires during the gesture.
  const segDragRef = useRef<{
    originalPoints: number[];
    originalMidX: number;
    originalMidY: number;
    axis: "h" | "v";
    startSegIdx: number;
    numOriginalSegs: number;
  } | null>(null);

  // Free-axis elbow endpoint drag state. The endpoint follows the pointer
  // in any direction; each frame we rebuild the polyline from the snapshot
  // taken at drag start, inserting one orthogonal corner if needed so the
  // segment leading into the unchanged interior stays axis-aligned.
  const endpointDragRef = useRef<{
    originalPoints: number[];
    end: "start" | "end";
    /** Axis of the adjacent segment at drag-start. We preserve this axis
     *  for the stub that enters the unchanged interior, so the rest of the
     *  polyline's topology is untouched. */
    adjacentAxis: "h" | "v" | "degenerate";
  } | null>(null);

  if (n < 4) return null;

  const hitR = 12 / zoom;
  const visR = 5 / zoom;
  const stroke = accent || "#0d9488";

  const beginCoalesce = (handleKey: string) => {
    useStore.getState().beginHistoryCoalesce(`line-handle-${shape.id}-${handleKey}`);
  };
  const endCoalesce = () => {
    useStore.getState().endHistoryCoalesce();
  };
  const gestureKey = (prefix: string) =>
    `${prefix}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;

  // Pill visible dimensions in screen-px (pre-zoom). Long-axis 14,
  // short-axis 6 — matches Canva's segment-midpoint grabber. Rendered
  // fully-rounded by setting cornerRadius to half the short axis.
  const pillLong = 14 / zoom;
  const pillShort = 6 / zoom;
  const pillCorner = pillShort / 2;

  const handleNode = (opts: {
    key: string;
    x: number;
    y: number;
    onStart: () => void;
    onMove: (e: KonvaEventObject<DragEvent>) => void;
    onEnd?: () => void;
    fill?: string;
    /** "circle" (default) — round endpoint/corner handle.
     *  "pill" — fully-rounded rectangle for segment-midpoint handles. */
    glyph?: "circle" | "pill";
    /** Orientation of the pill's long axis. Ignored for circle.
     *  "h" = horizontal long axis, "v" = vertical long axis. */
    pillAxis?: "h" | "v";
  }) => {
    const isPill = opts.glyph === "pill";
    const pw = isPill
      ? opts.pillAxis === "v" ? pillShort : pillLong
      : 0;
    const ph = isPill
      ? opts.pillAxis === "v" ? pillLong : pillShort
      : 0;
    return (
      <Group
        key={opts.key}
        x={opts.x}
        y={opts.y}
        draggable
        onMouseDown={(e) => {
          e.cancelBubble = true;
        }}
        onDragStart={(e) => {
          e.cancelBubble = true;
          opts.onStart();
        }}
        onDragMove={(e) => {
          e.cancelBubble = true;
          opts.onMove(e);
        }}
        onDragEnd={(e) => {
          e.cancelBubble = true;
          opts.onEnd?.();
          endCoalesce();
        }}
      >
        {isPill ? (
          <>
            <Rect
              x={-hitR}
              y={-hitR}
              width={hitR * 2}
              height={hitR * 2}
              fill="rgba(0,0,0,0.001)"
            />
            <Rect
              x={-pw / 2}
              y={-ph / 2}
              width={pw}
              height={ph}
              cornerRadius={pillCorner}
              fill={opts.fill ?? "#ffffff"}
              stroke={stroke}
              strokeWidth={1.5 / zoom}
              listening={false}
            />
          </>
        ) : (
          <>
            <Circle radius={hitR} fill="rgba(0,0,0,0.001)" />
            <Circle
              radius={visR}
              fill={opts.fill ?? "#ffffff"}
              stroke={stroke}
              strokeWidth={1.5 / zoom}
              listening={false}
            />
          </>
        )}
      </Group>
    );
  };

  const nodes: React.ReactNode[] = [];

  // ─── Straight & curved branch ───────────────────────────────────────
  if (routing !== "elbow") {
    nodes.push(handleNode({
      key: "start",
      x: pts[0],
      y: pts[1],
      onStart: () => beginCoalesce(gestureKey("endpoint-start")),
      onMove: (e) => {
        const cur = useStore.getState().shapes.find((x) => x.id === shape.id);
        if (!cur || cur.type !== "line") return;
        const next = cur.points.slice();
        next[0] = e.target.x();
        next[1] = e.target.y();
        updateShape(shape.id, { points: next } as Partial<Shape>);
      },
    }));
    nodes.push(handleNode({
      key: "end",
      x: pts[n - 2],
      y: pts[n - 1],
      onStart: () => beginCoalesce(gestureKey("endpoint-end")),
      onMove: (e) => {
        const cur = useStore.getState().shapes.find((x) => x.id === shape.id);
        if (!cur || cur.type !== "line") return;
        const m = cur.points.length;
        const next = cur.points.slice();
        next[m - 2] = e.target.x();
        next[m - 1] = e.target.y();
        updateShape(shape.id, { points: next } as Partial<Shape>);
      },
    }));

    // Curvature midpoint pill — curved routing only. Straight lines
    // intentionally show *just* the two endpoints; the way to get a
    // curve is to pick Curved from the LineToolMenu Type control, not
    // to drag a ghost handle on the straight line.
    if (routing === "curved") {
      const s = { x: pts[0], y: pts[1] };
      const e = { x: pts[n - 2], y: pts[n - 1] };
      const curK = shape.curvature ?? 0;
      const pos = curvatureHandlePos(s, e, curK);
      // Pill aligned perpendicular to the chord so it reads as a
      // "handle on the line" rather than crossing it.
      const chordAxis = segmentAxis(s, e);
      const pillAxis: "h" | "v" =
        chordAxis === "h" ? "v" : chordAxis === "v" ? "h" : "v";
      nodes.push(handleNode({
        key: "midpoint",
        x: pos.x,
        y: pos.y,
        glyph: "pill",
        pillAxis,
        onStart: () => beginCoalesce(gestureKey("midpoint")),
        onMove: (ev) => {
          const k = curvatureFromHandle(s, e, {
            x: ev.target.x(),
            y: ev.target.y(),
          });
          updateShape(shape.id, { curvature: k } as Partial<Shape>);
        },
      }));
    }

    return <>{nodes}</>;
  }

  // ─── Elbow branch — segment-midpoint primary affordance ────────────
  // Derive segments from the rendered polyline so we cover the length-4
  // legacy fallback (computeElbowPath) and the new length-≥6 explicit form.
  const renderPts = pts.length >= 6
    ? pts
    : computeElbowPath(pts, shape.elbowOrientation ?? "HV");
  const segs = segmentsFromPolyline(renderPts);
  const numSegs = segs.length;

  // Lazy-migrate legacy length-4 points to canonical length-6 polyline on
  // the first interactive drag. Visually identical — the expanded polyline
  // matches what computeElbowPath produced before.
  const ensureMigrated = (): number[] => {
    if (pts.length >= 6) return pts.slice();
    const expanded = expandLegacyElbowToPolyline(
      pts,
      shape.elbowOrientation ?? "HV",
    );
    updateShape(shape.id, { points: expanded } as Partial<Shape>);
    return expanded;
  };

  // Endpoint handles — axis-constrained along the adjacent segment.
  if (numSegs > 0) {
    const firstSeg = segs[0];
    const firstAxis = segmentAxis(firstSeg[0], firstSeg[1]);
    const startPt = firstSeg[0];
    nodes.push(handleNode({
      key: "start",
      x: startPt.x,
      y: startPt.y,
      onStart: () => {
        const migrated = ensureMigrated();
        endpointDragRef.current = {
          originalPoints: migrated,
          end: "start",
          adjacentAxis: firstAxis,
        };
        beginCoalesce(gestureKey("endpoint-start"));
      },
      onMove: (e) => {
        const d = endpointDragRef.current;
        if (!d) return;
        const newX = e.target.x();
        const newY = e.target.y();
        const orig = d.originalPoints;
        // B is the vertex after the dragged endpoint. The stub we may
        // insert goes A'→Q→B, chosen so Q→B preserves the original
        // adjacent-segment axis and the interior polyline is untouched.
        const Bx = orig[2];
        const By = orig[3];
        let qx: number | null = null;
        let qy: number | null = null;
        if (d.adjacentAxis === "h") {
          qx = newX;
          qy = By;
        } else if (d.adjacentAxis === "v") {
          qx = Bx;
          qy = newY;
        }
        let next: number[];
        if (qx === null || qy === null) {
          next = [newX, newY, ...orig.slice(2)];
        } else {
          const qEqEndpoint = Math.abs(qx - newX) < EPS && Math.abs(qy - newY) < EPS;
          const qEqB = Math.abs(qx - Bx) < EPS && Math.abs(qy - By) < EPS;
          if (qEqEndpoint || qEqB) {
            next = [newX, newY, ...orig.slice(2)];
          } else {
            next = [newX, newY, qx, qy, ...orig.slice(2)];
          }
        }
        updateShape(shape.id, { points: next } as Partial<Shape>);
      },
      onEnd: () => {
        endpointDragRef.current = null;
      },
    }));

    const lastSeg = segs[numSegs - 1];
    const lastAxis = segmentAxis(lastSeg[0], lastSeg[1]);
    const endPt = lastSeg[1];
    nodes.push(handleNode({
      key: "end",
      x: endPt.x,
      y: endPt.y,
      onStart: () => {
        const migrated = ensureMigrated();
        endpointDragRef.current = {
          originalPoints: migrated,
          end: "end",
          adjacentAxis: lastAxis,
        };
        beginCoalesce(gestureKey("endpoint-end"));
      },
      onMove: (e) => {
        const d = endpointDragRef.current;
        if (!d) return;
        const newX = e.target.x();
        const newY = e.target.y();
        const orig = d.originalPoints;
        const m = orig.length;
        // P is the vertex just before the dragged endpoint (originally
        // the last interior vertex). Stub inserted between P and new end
        // preserves the P→Q axis so the interior polyline is untouched.
        const Px = orig[m - 4];
        const Py = orig[m - 3];
        let qx: number | null = null;
        let qy: number | null = null;
        if (d.adjacentAxis === "h") {
          qx = newX;
          qy = Py;
        } else if (d.adjacentAxis === "v") {
          qx = Px;
          qy = newY;
        }
        let next: number[];
        if (qx === null || qy === null) {
          next = [...orig.slice(0, m - 2), newX, newY];
        } else {
          const qEqEndpoint = Math.abs(qx - newX) < EPS && Math.abs(qy - newY) < EPS;
          const qEqP = Math.abs(qx - Px) < EPS && Math.abs(qy - Py) < EPS;
          if (qEqEndpoint || qEqP) {
            next = [...orig.slice(0, m - 2), newX, newY];
          } else {
            next = [...orig.slice(0, m - 2), qx, qy, newX, newY];
          }
        }
        updateShape(shape.id, { points: next } as Partial<Shape>);
      },
      onEnd: () => {
        endpointDragRef.current = null;
      },
    }));
  }

  // Segment-midpoint handles — one per rendered segment, perpendicular drag.
  // Position is the midpoint of the VISIBLE straight portion (segment clipped
  // by the arc zones at rounded corners), so pills always sit on the line.
  // Short segments whose visible portion can't contain the pill are skipped.
  const visSegs = roundedElbowVisibleSegments(renderPts, 12 / zoom);
  const pillMinLen = 14 / zoom;
  segs.forEach((seg, segIdx) => {
    const [a, b] = seg;
    const axis = segmentAxis(a, b);
    if (axis === "degenerate") return;
    const vis = visSegs[segIdx];
    if (!vis) return;
    const [va, vb] = vis;
    const visLen = Math.hypot(vb.x - va.x, vb.y - va.y);
    // Hide the pill when the visible straight portion is shorter than the
    // pill itself — otherwise the pill would extend past the rendered line
    // into the arc zone / empty space (Canva hides the handle here too).
    if (visLen < pillMinLen) return;
    const midX = (va.x + vb.x) / 2;
    const midY = (va.y + vb.y) / 2;

    nodes.push(handleNode({
      key: `seg-${segIdx}`,
      x: midX,
      y: midY,
      fill: "rgba(255,255,255,0.9)",
      glyph: "pill",
      pillAxis: axis as "h" | "v",
      onStart: () => {
        // Snapshot the pre-migration polyline so onDragMove can replay
        // the insert/translate op from a stable base regardless of how
        // many frames the gesture spans.
        const migrated = ensureMigrated();
        const actualNumSegs = Math.max(0, (migrated.length - 2) / 2);
        segDragRef.current = {
          originalPoints: migrated,
          originalMidX: midX,
          originalMidY: midY,
          axis: axis as "h" | "v",
          startSegIdx: segIdx,
          numOriginalSegs: actualNumSegs,
        };
        beginCoalesce(gestureKey(`segdrag-${segIdx}`));
      },
      onMove: (e) => {
        const d = segDragRef.current;
        if (!d) return;
        // Lock off-axis coord visually so the handle tracks only the
        // perpendicular drag direction.
        if (d.axis === "h") e.target.x(d.originalMidX);
        else e.target.y(d.originalMidY);
        const delta = d.axis === "h"
          ? e.target.y() - d.originalMidY
          : e.target.x() - d.originalMidX;
        if (Math.abs(delta) < EPS) {
          updateShape(shape.id, { points: d.originalPoints } as Partial<Shape>);
          return;
        }
        let next: number[];
        if (d.startSegIdx === 0 && d.numOriginalSegs > 1) {
          next = insertSegmentAtEndpoint(d.originalPoints, "start", delta);
        } else if (
          d.startSegIdx === d.numOriginalSegs - 1 &&
          d.numOriginalSegs > 1
        ) {
          next = insertSegmentAtEndpoint(d.originalPoints, "end", delta);
        } else {
          next = translateSegmentPerpendicular(
            d.originalPoints,
            d.startSegIdx,
            delta,
          );
        }
        updateShape(shape.id, { points: next } as Partial<Shape>);
      },
      onEnd: () => {
        segDragRef.current = null;
      },
    }));
  });

  return <>{nodes}</>;
}

function PenShapeNode({
  shape,
  draggable,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  shape: PenShape;
  draggable: boolean;
  onSelect: (e?: KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onDragStart: (e: KonvaEventObject<DragEvent>) => void;
  onDragMove: (e: KonvaEventObject<DragEvent>) => void;
  onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
}) {
  const groupRef = useRef<Konva.Group>(null);
  const zoom = useStore((s) => s.zoom);
  const marks: EraseMark[] = shape.eraseMarks ?? [];
  const hasMarks = marks.length > 0;
  // World-unit strokes (new): Konva's group scale handles zoom — render the
  // stored value directly. Legacy screen-px strokes: divide by zoom so the
  // group scale cancels out, keeping them a constant screen size.
  const renderStrokeWidth =
    shape.strokeWidthUnit === "world"
      ? (shape.strokeWidth ?? 1)
      : (shape.strokeWidth ?? 1) / zoom;

  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    if (hasMarks) {
      // Cache at pixelRatio tuned to current zoom so holes stay crisp when
      // the user is zoomed in past 1x. Clamped to [2, 6] to bound memory.
      const pr = Math.max(2, Math.min(6, zoom * 2));
      try {
        g.cache({ pixelRatio: pr });
      } catch {
        // cache() throws if the group has no visible content yet — safe to ignore.
      }
    } else {
      g.clearCache();
    }
    g.getLayer()?.batchDraw();
  }, [
    hasMarks,
    marks,
    shape.points,
    shape.strokeWidth,
    shape.stroke,
    shape.opacity,
    zoom,
  ]);

  return (
    <Group
      ref={groupRef}
      x={shape.x}
      y={shape.y}
      rotation={shape.rotation ?? 0}
      draggable={draggable}
      onClick={onSelect}
      onTap={onSelect}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
    >
      <Line
        points={shape.points}
        stroke={shape.stroke}
        strokeWidth={renderStrokeWidth}
        opacity={shape.opacity ?? 1}
        tension={0.5}
        lineCap="round"
        lineJoin="round"
      />
      {marks.map((m, i) => (
        <Circle
          key={i}
          x={m.cx}
          y={m.cy}
          radius={m.unit === "world" ? m.r : m.r / zoom}
          fill="#000"
          globalCompositeOperation="destination-out"
          listening={false}
        />
      ))}
    </Group>
  );
}

function UrlImage({
  shape,
  selected,
  onSelect,
  onChange,
  draggable,
  onDragStartProxy,
  onDragMoveProxy,
  onDragEndProxy,
}: {
  shape: ImageShape;
  selected: boolean;
  onSelect: (e?: KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onChange: (p: Partial<Shape>) => void;
  draggable: boolean;
  onDragStartProxy?: (e: KonvaEventObject<DragEvent>) => void;
  onDragMoveProxy?: (e: KonvaEventObject<DragEvent>) => void;
  onDragEndProxy?: (e: KonvaEventObject<DragEvent>, patch: Partial<Shape>) => void;
}) {
  const [img] = useImage(shape.src);
  const accent =
    typeof window !== "undefined"
      ? getComputedStyle(document.documentElement)
          .getPropertyValue("--accent")
          .trim() || "#0d9488"
      : "#0d9488";
  return (
    <KImage
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      image={img}
      stroke={selected ? accent : undefined}
      strokeWidth={selected ? 2 : 0}
      draggable={draggable}
      onClick={onSelect}
      onTap={onSelect}
      onDragStart={onDragStartProxy}
      onDragMove={onDragMoveProxy}
      onDragEnd={(e) => {
        const patch = { x: e.target.x(), y: e.target.y() };
        if (onDragEndProxy) onDragEndProxy(e, patch);
        else onChange(patch);
      }}
    />
  );
}

/**
 * Renders any of the 14 unified ShapeKind variants. Picks a Konva primitive
 * (Rect, Ellipse, RegularPolygon, Star) when possible; otherwise falls back
 * to a Konva.Path computed from shapePathFor(). Style fields (border, fill,
 * opacity, image fill) are applied uniformly via a single `commonProps`
 * object, so all shape kinds inherit identical styling behavior.
 */
function UnifiedShapeNode({
  shape,
  selected,
  accent,
  draggable,
  onSelect,
  onDragStartProxy,
  onDragMoveProxy,
  onDragEndProxy,
}: {
  shape: ShapeShape;
  selected: boolean;
  accent: string;
  draggable: boolean;
  onSelect: (e?: KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onDragStartProxy: (e: KonvaEventObject<DragEvent>) => void;
  onDragMoveProxy: (e: KonvaEventObject<DragEvent>) => void;
  onDragEndProxy: (e: KonvaEventObject<DragEvent>, patch: Partial<Shape>) => void;
}) {
  const editingTextId = useStore((s) => s.editingTextShapeId);
  const editing = editingTextId === shape.id;
  const beginTextEdit = useStore((s) => s.beginTextEdit);
  const [fillImg] = useImage(shape.style.imageFill?.src ?? "");

  const renderer = KIND_RENDERER[shape.kind];
  const w = Math.max(1, shape.width);
  const h = Math.max(1, shape.height);
  const style = shape.style;

  const isText = isTextElement(shape);
  // Text elements get a faint dashed outline only while selected (and not in
  // edit mode — TextEditOverlay draws its own teal dashed border in that
  // state). Other shapes keep the bold solid selection ring.
  const selectStroke = selected ? accent : undefined;
  const selectStrokeWidth = selected ? (isText ? 1 : 2) : 0;
  const selectDash = isText ? [4, 3] : undefined;
  const borderStroke = style.borderEnabled ? style.borderColor : undefined;
  const borderWidth = style.borderEnabled ? style.borderWeight : 0;
  // Selection ring takes priority visually if border is off.
  const stroke = borderStroke ?? (selected && !editing ? selectStroke : undefined);
  const strokeWidth = borderStroke ? borderWidth : selected && !editing ? selectStrokeWidth : 0;
  const dash = style.borderEnabled
    ? dashFor(style.borderStyle, style.borderWeight)
    : selected && !editing
      ? selectDash
      : undefined;

  // Fill: image-pattern overrides solid color when set + image loaded.
  const fillProps: Record<string, unknown> = {};
  if (style.imageFill?.src && fillImg) {
    fillProps.fillPatternImage = fillImg;
    const iw = fillImg.naturalWidth || fillImg.width || 1;
    const ih = fillImg.naturalHeight || fillImg.height || 1;
    if (style.imageFill.crop) {
      const c = style.imageFill.crop;
      const sx = w / Math.max(1, c.w);
      const sy = h / Math.max(1, c.h);
      fillProps.fillPatternScale = { x: sx, y: sy };
      fillProps.fillPatternOffset = { x: c.x, y: c.y };
    } else {
      const fit = style.imageFill.fit;
      const scale =
        fit === "contain"
          ? Math.min(w / iw, h / ih)
          : Math.max(w / iw, h / ih);
      fillProps.fillPatternScale = { x: scale, y: scale };
      // Center: offset = (image-size-in-pattern-units / 2) - (shape-size / 2 / scale)
      fillProps.fillPatternOffset = {
        x: iw / 2 - w / (2 * scale),
        y: ih / 2 - h / (2 * scale),
      };
    }
  } else {
    fillProps.fill = style.fillColor;
  }

  const commonProps = {
    ...fillProps,
    opacity: style.fillOpacity,
    stroke,
    strokeWidth,
    dash,
    draggable,
    onClick: onSelect,
    onTap: onSelect,
    onDragStart: onDragStartProxy,
    onDragMove: onDragMoveProxy,
    onDragEnd: (e: KonvaEventObject<DragEvent>) =>
      onDragEndProxy(e, { x: e.target.x(), y: e.target.y() }),
    onDblClick: (e: KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true;
      beginTextEdit(shape.id);
    },
    onDblTap: (e: KonvaEventObject<TouchEvent>) => {
      e.cancelBubble = true;
      beginTextEdit(shape.id);
    },
    rotation: shape.rotation ?? 0,
    id: shape.id,
  };

  // Konva primitives that take width/height directly use top-left origin.
  // Ellipse / RegularPolygon / Star use center origin so we offset by w/2,h/2.
  const node =
    renderer === "rect" ? (
      <Rect
        {...commonProps}
        x={shape.x}
        y={shape.y}
        width={w}
        height={h}
        cornerRadius={style.cornerRadius}
      />
    ) : renderer === "ellipse" ? (
      <Ellipse
        {...commonProps}
        x={shape.x + w / 2}
        y={shape.y + h / 2}
        radiusX={w / 2}
        radiusY={h / 2}
      />
    ) : renderer === "polygon" ? (
      <RegularPolygon
        {...commonProps}
        x={shape.x + w / 2}
        y={shape.y + h / 2}
        sides={shape.kind === "triangle" ? 3 : Math.max(3, Math.min(12, shape.polygonSides ?? 6))}
        radius={Math.min(w, h) / 2}
      />
    ) : renderer === "star" ? (
      <KStar
        {...commonProps}
        x={shape.x + w / 2}
        y={shape.y + h / 2}
        numPoints={5}
        innerRadius={Math.min(w, h) / 4}
        outerRadius={Math.min(w, h) / 2}
      />
    ) : (
      <KPath
        {...commonProps}
        x={shape.x}
        y={shape.y}
        data={shapePathFor(shape.kind, w, h)}
      />
    );

  // In-shape text overlay. Suppressed while the HTML textarea overlay is
  // active for this shape (edit mode). Optional bg Rect renders behind the
  // text when text.bgColor is set; transparent when undefined.
  const text = shape.text;
  const showText = !!text && text.text.length > 0 && !editing;
  const indentPx = (text?.indent ?? 0) * 16;
  const showBg = !!text && !!text.bgColor && !editing;
  return (
    <Group>
      {node}
      {showBg && (
        <Rect
          x={shape.x}
          y={shape.y}
          width={w}
          height={h}
          rotation={shape.rotation ?? 0}
          fill={text!.bgColor}
          listening={false}
        />
      )}
      {showText && (
        <Text
          x={shape.x + 6 + indentPx}
          y={shape.y + 6}
          width={Math.max(1, w - 12 - indentPx)}
          height={h - 12}
          rotation={shape.rotation ?? 0}
          text={formatListLines(
            text!.text,
            text!.bullets,
            text!.indent ?? 0,
            text!.bulletStyle,
            text!.numberStyle,
          )}
          fontFamily={text!.font}
          fontSize={text!.fontSize}
          fontStyle={fontStyleFor(text!.bold, text!.italic)}
          textDecoration={text!.underline ? "underline" : ""}
          align={text!.align}
          verticalAlign="middle"
          fill={text!.color}
          listening={false}
        />
      )}
    </Group>
  );
}

function fontStyleFor(bold: boolean, italic: boolean): string {
  const parts: string[] = [];
  if (italic) parts.push("italic");
  if (bold) parts.push("bold");
  return parts.join(" ") || "normal";
}

function hitTest(sh: Shape, x: number, y: number): boolean {
  if (sh.type === "rect" || sh.type === "sticky" || sh.type === "image") {
    const w = sh.width;
    const h = sh.height;
    return x >= sh.x && x <= sh.x + w && y >= sh.y && y <= sh.y + h;
  }
  if (sh.type === "shape") {
    const w = sh.width;
    const h = sh.height;
    return x >= sh.x && x <= sh.x + w && y >= sh.y && y <= sh.y + h;
  }
  if (sh.type === "line" || sh.type === "pen") {
    const pts = sh.points;
    if (polylineDistance(pts, x, y) >= 6) return false;
    // A point that's inside any erase mark is visually a hole — treat as miss
    // so Object Eraser / Select don't target invisible centerline pixels.
    // New marks store r in world units; legacy marks store screen-px → /zoom.
    const marks = sh.type === "pen" ? sh.eraseMarks : undefined;
    if (marks && marks.length > 0) {
      const zoom = useStore.getState().zoom;
      for (const m of marks) {
        const dx = x - m.cx;
        const dy = y - m.cy;
        const rWorld = m.unit === "world" ? m.r : m.r / zoom;
        if (dx * dx + dy * dy <= rWorld * rWorld) return false;
      }
    }
    return true;
  }
  return false;
}
