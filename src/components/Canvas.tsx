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
import { useStore, uid } from "../store";
import { useThemeVars } from "../theme";
import type {
  EraseMark,
  ImageShape,
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
  const penVariant = useStore((s) => s.penVariant);
  const penVariants = useStore((s) => s.penVariants);
  const eraserVariant = useStore((s) => s.eraserVariant);
  const eraserSize = useStore((s) => s.eraserSize);
  const shapeKind = useStore((s) => s.shapeKind);
  const shapeDefaults = useStore((s) => s.shapeDefaults);
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
      const txt: Shape = {
        id,
        type: "text",
        sheetId,
        name: "Text",
        visible: true,
        locked: false,
        x: localX,
        y: localY,
        text: "Double-click to edit",
        fontSize: toolFontSize,
        fill: toolColors.text,
      };
      addShape(txt);
      setTool("select");
      selectShape(txt.id);
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
    if (sh.type === "text") {
      const fs = sh.fontSize;
      const w = (sh.text?.length ?? 1) * fs * 0.5;
      const h = fs * 1.2;
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
        .shapes.find((s) => s.id === drawing.id) as RectShape | ShapeShape | undefined;
      if (
        sh &&
        (sh.type === "rect" || sh.type === "shape") &&
        (Math.abs(sh.width) < 3 || Math.abs(sh.height) < 3)
      ) {
        useStore.getState().deleteShape(sh.id);
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
                    {/* shadow */}
                    <Rect
                      x={4 / zoom}
                      y={6 / zoom}
                      width={s.width}
                      height={s.height}
                      fill="rgba(0,0,0,0.45)"
                      cornerRadius={6 / zoom}
                    />
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
                        onSelect={(
                          e?: KonvaEventObject<MouseEvent | TouchEvent>
                        ) => {
                          if (tool === "select" && !s.locked)
                            onShapeClickSelect(sh.id, e);
                        }}
                        onChange={(patch) => updateShape(sh.id, patch)}
                        draggable={tool === "select" && !s.locked}
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
  onSelect,
  onChange,
  draggable,
  onGroupDragStart,
  onGroupDragMove,
  onGroupDragEnd,
}: {
  shape: Shape;
  selected: boolean;
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
    return (
      <Line
        points={shape.points}
        stroke={shape.stroke}
        strokeWidth={renderStrokeWidth}
        lineCap="round"
        onClick={onSelect}
        onTap={onSelect}
      />
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
  if (shape.type === "text") {
    return (
      <Text
        x={shape.x}
        y={shape.y}
        text={shape.text}
        fontSize={shape.fontSize}
        fill={shape.fill}
        fontStyle="500"
        stroke={stroke}
        strokeWidth={selected ? 0.5 : 0}
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

  const selectStroke = selected ? accent : undefined;
  const selectStrokeWidth = selected ? 2 : 0;
  const borderStroke = style.borderEnabled ? style.borderColor : undefined;
  const borderWidth = style.borderEnabled ? style.borderWeight : 0;
  // Selection ring takes priority visually if border is off.
  const stroke = borderStroke ?? selectStroke;
  const strokeWidth = borderStroke ? borderWidth : selectStrokeWidth;
  const dash = style.borderEnabled ? dashFor(style.borderStyle, style.borderWeight) : undefined;

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

  // In-shape text overlay (centered, clipped to bbox). Suppressed while the
  // HTML textarea overlay is active for this shape (edit mode).
  const text = shape.text;
  const showText = !!text && text.text.length > 0 && !editing;
  return (
    <Group>
      {node}
      {showText && (
        <Text
          x={shape.x + 6}
          y={shape.y + 6}
          width={w - 12}
          height={h - 12}
          rotation={shape.rotation ?? 0}
          text={text!.bullets ? prefixBullets(text!.text) : text!.text}
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

function prefixBullets(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.length ? `\u2022 ${line}` : line))
    .join("\n");
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
  if (sh.type === "text") {
    const w = (sh.text.length * sh.fontSize) / 2;
    const h = sh.fontSize * 1.2;
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
