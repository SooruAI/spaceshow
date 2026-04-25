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
  segmentAxis,
  segmentsFromPolyline,
  translateSegmentPerpendicular,
  insertSegmentAtEndpoint,
  canonicalizeOrthogonalPolyline,
  expandLegacyElbowToPolyline,
  buildRoundedElbowPath,
  roundedElbowVisibleSegments,
  autoSmoothTangents,
  computeMultiAnchorPath,
  resolveCurveAnchors,
  syncPointsFromAnchors,
  computeArcPath,
  resolveArcPoints,
} from "../lib/lineRouting";
import { LineMarkerEnds } from "./lineTool/LineMarkerEnds";
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
import { uploadImageFile } from "../lib/imageUpload";
import { insertViewShape, VIEW_DRAG_MIME } from "../lib/viewInsert";
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
import { hasDocContent } from "../lib/tiptapDoc";
import { RichTextRender } from "./RichTextRender";
import {
  DEFAULT_STICKY_BG,
  DEFAULT_STICKY_BODY,
  authorName,
  shortDate,
} from "../lib/sticky";
import { useStore, uid } from "../store";
import { useThemeVars } from "../theme";
import type {
  CurveAnchor,
  EraseMark,
  ImageShape,
  LinePattern,
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

/**
 * Convert a world-space point to the given sheet's local coordinate frame.
 *
 * Sheets render with a center-origin transform (x = cx, y = cy, offset =
 * w/2,h/2, rotation), so a child shape's local (x, y) is "relative to the
 * sheet's top-left in the sheet's own rotated frame". For non-rotated sheets
 * the conversion is a simple translate; rotated sheets need the inverse
 * rotation around the sheet centre. Used by the canvas drag handler to
 * reparent a shape into a different sheet without visually teleporting it.
 */
function worldToSheetLocalXY(
  abs: { x: number; y: number },
  sheet: Sheet,
): { x: number; y: number } {
  const rot = sheet.rotation ?? 0;
  if (!rot) return { x: abs.x - sheet.x, y: abs.y - sheet.y };
  const cx = sheet.x + sheet.width / 2;
  const cy = sheet.y + sheet.height / 2;
  const dx = abs.x - cx;
  const dy = abs.y - cy;
  const rad = (-rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;
  return { x: sheet.width / 2 + rx, y: sheet.height / 2 + ry };
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
  // Canvas context-menu orchestration lives in the store so the Stage can
  // emit and a sibling overlay component (Phase 2) can consume without
  // prop-drilling. Phase 1 only wires the emitter.
  const openContextMenu = useStore((s) => s.openContextMenu);
  const showSelectionToolbarFor = useStore((s) => s.showSelectionToolbarFor);
  const hideSelectionToolbar = useStore((s) => s.hideSelectionToolbar);
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
  // Persistent angle badge for the currently-selected single shape. Doubles
  // as a live read-out during a rotation drag and as an editable input when
  // idle so the user can type a precise angle. Viewport coords. Position is
  // re-derived from the Transformer's bbox via a useEffect below; the angle
  // updates from the live Konva node during a drag (so 1° precision shows
  // even before the store commits) and from the store otherwise.
  const [rotBadge, setRotBadge] = useState<{
    shapeId: string;
    x: number;
    y: number;
    angle: number;
  } | null>(null);
  const [isRotating, setIsRotating] = useState(false);
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
  // Drag-drop upload: `dragCounter` tracks nested dragenter/leave events so
  // the overlay doesn't flicker when crossing child elements. Overlay renders
  // whenever dragCounter > 0 and the drag carries files.
  const [dragCounter, setDragCounter] = useState(0);
  const croppingImageId = useStore((s) => s.croppingImageId);
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

  // Cross-browser backstop for suppressing the browser's native right-click
  // menu. Konva's `onContextMenu` prop wires a React synthetic handler on the
  // stage container, but a handful of edge cases can cause the native menu to
  // flash for one frame before Konva's handler runs:
  //   • Firefox: historically fires `contextmenu` on `mousedown` for button 2
  //     rather than `mouseup`, and any async work before `preventDefault` can
  //     race the native menu.
  //   • Safari: Ctrl+click on macOS synthesizes a `contextmenu` event; if a
  //     browser extension injects a capture-phase listener that stops
  //     propagation, Konva's bubble-phase React handler never runs.
  //   • Brave / Edge: same-as-Chrome in most cases, but ad-blockers or tab
  //     groups sometimes attach document-level `contextmenu` listeners that
  //     can pre-empt React's synthetic event system.
  //   • Touchpad two-finger-tap: on some trackpads this fires a real
  //     `contextmenu` event with `pointerType === "touch"`; other trackpads
  //     synthesize it from gestures. The native listener sees both equally.
  //
  // This listener attaches directly to the stage's DOM container (the same
  // node React-Konva targets) in the CAPTURE phase so it runs BEFORE any
  // listener added via `addEventListener` without capture, and before React's
  // synthetic dispatch. It calls `preventDefault()` only — never
  // `stopPropagation()` — so Konva's `onContextMenu` handler still fires and
  // opens our custom menu. Belt-and-suspenders: even if Konva's handler
  // somehow failed to preventDefault (extension interference, future Konva
  // bug), this guarantees the browser never renders its native menu.
  useEffect(() => {
    const container = stageRef.current?.container();
    if (!container) return;
    function onNativeContextMenu(e: MouseEvent) {
      e.preventDefault();
    }
    container.addEventListener("contextmenu", onNativeContextMenu, {
      capture: true,
    });
    return () => {
      container.removeEventListener("contextmenu", onNativeContextMenu, {
        capture: true,
      });
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

  // When the active tool changes, clear any imperatively-set cursor on the
  // Konva stage container. Hover handlers on draggable nodes (e.g. pens)
  // mutate `stage.container().style.cursor = "move"` to advertise drag — but
  // that inline style wins over the outer wrapper div's inherited tool cursor
  // until something clears it. If the user switches Select → Pen while still
  // hovering a stroke, onMouseLeave never fires and the "move" cursor gets
  // stranded, masking the pen nib. This effect is the safety net: it resets
  // the inline cursor on every tool transition so the wrapper's tool-based
  // cursor (pen nib, eraser, crosshair, …) takes over immediately.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.container().style.cursor = "";
  }, [tool]);

  // ContextMenu → "Add a Comment" dispatches this event with the original
  // viewport coordinates of the right-click. We own the viewport→world→
  // sheet-local conversion here because (a) only the Canvas knows the
  // stage's DOM offset, and (b) `findSheetAt` / `screenToWorld` already
  // live in this scope. Mirrors the comment-tool onMouseDown branch
  // (select a sheet → localize coords → addThread → focus composer) so
  // the two entry points behave identically.
  //
  // `useStore.getState()` is read inside the handler on every firing
  // instead of relying on closure variables, so pan/zoom stay current
  // without rebinding the listener on every pan/zoom tick.
  useEffect(() => {
    function onAddCommentAt(ev: Event) {
      const detail = (ev as CustomEvent<{ clientX: number; clientY: number }>)
        .detail;
      if (!detail) return;
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.container().getBoundingClientRect();
      const stageX = detail.clientX - rect.left;
      const stageY = detail.clientY - rect.top;
      const st = useStore.getState();
      // Inline the world-coord math — equivalent to the local screenToWorld
      // helper but reading zoom/pan from latest store state so this stays
      // correct under pan/zoom without a dep array.
      const wx = (stageX - st.pan.x) / st.zoom;
      const wy = (stageY - st.pan.y) / st.zoom;
      const targetSheet = [...st.sheets]
        .reverse()
        .find(
          (sh) =>
            wx >= sh.x &&
            wx <= sh.x + sh.width &&
            wy >= sh.y &&
            wy <= sh.y + sh.height,
        );
      const canvasId = targetSheet?.id ?? "board";
      const localX = targetSheet ? wx - targetSheet.x : wx;
      const localY = targetSheet ? wy - targetSheet.y : wy;
      const newThreadId = st.addThread({
        canvasId,
        coordinates: { x: localX, y: localY },
      });
      st.openRightPanel("comments");
      st.setActiveThread(newThreadId);
      useStore.setState({ pendingFocusThreadId: newThreadId });
    }
    window.addEventListener("spaceshow:add-comment-at", onAddCommentAt);
    return () =>
      window.removeEventListener("spaceshow:add-comment-at", onAddCommentAt);
  }, []);

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
    let anyPen = false;
    let anyNonPen = false;
    for (const id of ids) {
      const sh = byId.get(id);
      if (
        !sh ||
        (sh.type !== "shape" && sh.type !== "image" && sh.type !== "pen") ||
        !sh.visible ||
        sh.locked
      )
        continue;
      // Skip the image currently being cropped — its UrlImage is unmounted
      // so its id has no node, and leaving a stale node bound would render
      // the Transformer anchors over the CropOverlay handles and eat the
      // mouse events meant for crop resize.
      if (sh.id === croppingImageId) continue;
      // Text elements get the transformer too: dragging a handle flips
      // `text.autoFit = false` (see onTransformEnd) so the box stops
      // auto-growing and word-wraps inside the user's chosen size.
      // Image elements also get resize/rotate handles.
      // Pen elements get a selection border + rotate handle only — scale
      // anchors stay hidden because stretching a polyline feels weird.
      const node = stage.findOne("#" + id);
      if (node) nodes.push(node);
      if (sh.type === "pen") anyPen = true;
      else anyNonPen = true;
    }
    tr.nodes(nodes);
    // Pens-only selection: expose rotation only, no resize anchors. Mixed or
    // non-pen selection: full eight-anchor resize handles (JSX defaults).
    const pensOnly = anyPen && !anyNonPen;
    tr.resizeEnabled(!pensOnly);
    tr.getLayer()?.batchDraw();
  }, [selectedShapeId, selectedShapeIds, tool, shapes, croppingImageId]);

  // Persistent angle badge — keeps an editable degree readout floating above
  // the selected shape so the user can type a precise rotation without
  // opening the popover. Skipped while a rotation drag is in progress (the
  // drag handlers update the badge directly so the live angle reflects every
  // pixel of the gesture, not the last-committed store value). Position is
  // read from the Transformer's bbox after Konva paints, via rAF.
  useEffect(() => {
    if (isRotating) return;
    if (tool !== "select") {
      setRotBadge(null);
      return;
    }
    const ids =
      selectedShapeIds.length > 0
        ? selectedShapeIds
        : selectedShapeId
        ? [selectedShapeId]
        : [];
    if (ids.length !== 1) {
      setRotBadge(null);
      return;
    }
    const id = ids[0];
    const sh = shapes.find((s) => s.id === id);
    if (
      !sh ||
      (sh.type !== "shape" && sh.type !== "image" && sh.type !== "pen") ||
      !sh.visible ||
      sh.locked ||
      sh.id === croppingImageId
    ) {
      setRotBadge(null);
      return;
    }
    const handle = requestAnimationFrame(() => {
      const tr = transformerRef.current;
      const stage = stageRef.current;
      if (!tr || !stage) return;
      const nodes = tr.nodes();
      if (nodes.length !== 1 || nodes[0].id() !== id) return;
      const rect = tr.getClientRect({ relativeTo: stage });
      if (rect.width === 0 || rect.height === 0) return;
      const angle = (((sh.rotation ?? 0) % 360) + 360) % 360;
      setRotBadge({
        shapeId: id,
        x: rect.x + rect.width / 2,
        y: rect.y - 34,
        angle,
      });
    });
    return () => cancelAnimationFrame(handle);
  }, [
    selectedShapeId,
    selectedShapeIds,
    shapes,
    pan,
    zoom,
    tool,
    croppingImageId,
    isRotating,
  ]);

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

  // ─── Right-click / two-finger-tap context menu ─────────────────────────
  // Swallows the browser's default menu, classifies the hit target as
  // "board" vs. "element", mutates shape selection accordingly (element
  // right-click → that shape becomes the active selection; board or
  // non-shape right-click → selection clears), then opens the ContextMenu
  // overlay via `openContextMenu` for rendering.
  //
  // Two-finger trackpad tap on macOS fires the same native `contextmenu`
  // event as a right-click, so no extra pointer-handling is needed.
  //
  // Shape-id resolution walks up ancestors of `e.target` looking for a node
  // whose `.id()` matches a known shape. This is resilient to whatever Group
  // nesting each shape renderer uses (Rect inside Group, Line with a hit
  // wrapper, etc.) and sidesteps needing a per-renderer `onContextMenu`.
  function findShapeIdUnder(target: Konva.Node, stage: Konva.Stage): string | null {
    const ids = new Set(useStore.getState().shapes.map((s) => s.id));
    let node: Konva.Node | null = target;
    while (node && node !== stage) {
      const id = node.id();
      if (id && ids.has(id)) return id;
      node = node.getParent();
    }
    return null;
  }

  function onContextMenu(e: KonvaEventObject<PointerEvent>) {
    const stage = stageRef.current;
    if (!stage) return;
    // Block the browser's native menu before anything else. Every part of
    // this matters for cross-browser robustness:
    //   • `preventDefault()` synchronously — Chrome/Edge/Brave/Firefox all
    //     honor this when the `contextmenu` listener is non-passive (which
    //     it is by default). Firefox is particularly strict about timing:
    //     any async hop before preventDefault risks a one-frame native-menu
    //     flash.
    //   • `stopPropagation()` on the underlying DOM event — keeps the
    //     backstop listener on the canvas wrap div (see `useEffect` below)
    //     from double-handling and re-firing any logic.
    //   • `cancelBubble = true` on the Konva event — the Konva equivalent;
    //     prevents parent Konva nodes (if any ever attach their own
    //     `contextmenu`) from receiving a duplicate.
    //   • Defensive existence checks — Safari has historically shipped
    //     `PointerEvent` polyfills that omit `preventDefault`/`stopPropagation`
    //     in edge cases (e.g., synthetic events from extensions). Cheap to
    //     guard, impossible to regress.
    const ev = e.evt;
    if (ev) {
      if (typeof ev.preventDefault === "function") ev.preventDefault();
      if (typeof ev.stopPropagation === "function") ev.stopPropagation();
    }
    e.cancelBubble = true;

    const x = ev?.clientX ?? 0;
    const y = ev?.clientY ?? 0;

    // Empty-board hit: the Konva target is the Stage itself (mirrors the
    // marquee-start check in onMouseDown at the equivalent spot below).
    if (e.target === stage) {
      // Phase 3: drop any active shape selection so the SelectionToolbar
      // disappears and the right-sidebar inspector empties — matches the
      // "I clicked away from everything" mental model the user expects
      // when they right-click empty space.
      //
      // `selectShape(null)` clears both `selectedShapeId` and
      // `selectedShapeIds` in one shot (see store:1805–1814), so there's
      // no separate `setSelectedShapeIds([])` call needed. Sheet selection
      // is intentionally left alone — the board menu's items don't depend
      // on it and users may want to keep a sheet "active" while working.
      selectShape(null);
      // Board right-click dismisses any lingering selection toolbar — the
      // user is leaving the "element" context entirely.
      hideSelectionToolbar();
      openContextMenu({ x, y, target: "board" });
      return;
    }

    const shapeId = findShapeIdUnder(e.target, stage);
    if (shapeId) {
      // Phase 3: make the right-clicked shape the active selection so both
      // the SelectionToolbar and the right-sidebar inspector surface it.
      // `selectShape(id)` (no bypass) expands grouped shapes to their
      // siblings — same behavior as left-click — so a right-click inside
      // a group selects the whole group. That means SelectionToolbar (which
      // is single-selection only) won't appear for grouped shapes on
      // right-click; that's consistent with what left-click does today.
      //
      // The context menu's per-shape actions (Delete, Lock, …) still
      // dispatch against the right-clicked shape via `ctx.elementId`, which
      // can differ from `selectedShapeIds` when a group is expanded. That
      // asymmetry is a known Phase-3 edge we can refine in Phase 4 if the
      // "operate on the whole selection" flavor is preferred.
      selectShape(shapeId);
      // The floating SelectionToolbar is paired with the context menu —
      // surfacing only on right-click/two-finger-tap, not on every single
      // selection. Anchor it to the same shape the menu is acting on.
      showSelectionToolbarFor(shapeId);
      openContextMenu({ x, y, target: "element", elementId: shapeId });
    } else {
      // Hit something that isn't a shape (sheet background, guide, handle,
      // comment pin, …). Semantically the user "clicked away from shapes,"
      // so we drop the shape selection and fall back to the board menu.
      // Per-target menus for pins/guides can come later if we want them.
      selectShape(null);
      hideSelectionToolbar();
      openContextMenu({ x, y, target: "board" });
    }
  }

  function onMouseDown(e: KonvaEventObject<MouseEvent>) {
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const { x: wx, y: wy } = screenToWorld(pointer.x, pointer.y);

    const evt = e.evt;

    // Commit an in-progress image crop when the user clicks anywhere outside
    // the crop UI (handles, outline). Mirrors how design tools treat an
    // outside click as "accept" — less friction than hunting for Done.
    // Handles/outline carry `name="crop-ui"` so drag-to-resize still works.
    if (useStore.getState().croppingImageId) {
      if (!e.target.hasName("crop-ui")) {
        useStore.getState().endImageCrop(true);
        return;
      }
    }

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
      // Stickies are canvas-level — store coerces sheetId to "board" too,
      // but we set it explicitly here so the shape clearly reads that way.
      // localX/localY are sheet-local from the caller; for board-level
      // stickies that's fine — the create site computes them from the
      // pointer in world coords when no sheet is hit.
      const userId = useStore.getState().currentUserId;
      // The next-sticky colour lives on `toolColors.sticky`, written by the
      // colour swatch in StickyFormatBar's tool-pick mode. Falls back to the
      // canonical yellow if the user hasn't customised it. This is what makes
      // the colour picker feel pre-emptive — pick yellow, drop a sticky, get
      // yellow; pick pink first, drop the next sticky, get pink — without us
      // having to update existing stickies.
      const seedBg =
        useStore.getState().toolColors.sticky ?? DEFAULT_STICKY_BG;
      const sticky: Shape = {
        id,
        type: "sticky",
        sheetId: "board",
        name: "Sticky note",
        visible: true,
        locked: false,
        x: localX,
        y: localY,
        width: 240,
        height: 200,
        bgColor: seedBg,
        authorId: userId ?? "anonymous",
        createdAt: Date.now(),
        // Header was removed by product direction; only body is rendered.
        // The `header` field on the shape stays optional for backwards
        // compat with persisted data, but new stickies don't seed it.
        body: { ...DEFAULT_STICKY_BODY },
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
          verticalAlign: toolTextDefaults.verticalAlign,
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
      // Normalize live so the shape grows in ANY drag direction. Both
      // `UnifiedShapeNode` and `shapePathFor` clamp width/height to >=1, so
      // a negative-width drag would otherwise stay collapsed at 1px until
      // the mouse-up cleanup kicks in. Patch x/y instead so the bbox always
      // covers (start ↔ current pointer) regardless of drag direction.
      const nx = drawing.x + Math.min(0, w);
      const ny = drawing.y + Math.min(0, h);
      scheduleDrawPatch(drawing.id, {
        x: nx,
        y: ny,
        width: Math.abs(w),
        height: Math.abs(h),
      } as Partial<Shape>);
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
  // selection — OR a canvas group — siblings receive the same delta. Deltas
  // are applied incrementally (only the difference since the last move) so
  // updateShape calls are additive. The whole drag coalesces into a single
  // undo entry via the history-coalesce gate begun in onStart.
  //
  // Two sources of siblings:
  //   1. Multi-selection: every other shape in `selectedShapeIds`.
  //   2. Canvas group: every other shape AND every sheet sharing
  //      `canvasGroupId` with the anchor. Sheets get their `x`/`y` shifted
  //      via `setSheetPosition` (raw write — bypasses layoutSheetsRow so the
  //      drag-time motion isn't snapped back). Child shapes that ride along
  //      with a sibling sheet are skipped (the sheet's translation already
  //      moves them visually; double-applying would jitter them).
  function onShapeGroupDragStart(anchorId: string) {
    const st = useStore.getState();
    const anchor = st.shapes.find((s) => s.id === anchorId);
    if (!anchor) return;
    const inMultiSelect = st.selectedShapeIds.includes(anchorId);
    const cgId = anchor.canvasGroupId ?? null;
    // Bail when there's nothing to sync to — saves a coalesce/cleanup pair.
    if (!inMultiSelect && !cgId) return;
    st.beginHistoryCoalesce(`group-drag-${anchorId}-${uid()}`);
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

    const st = useStore.getState();
    const anchor = st.shapes.find((s) => s.id === anchorId);
    const cgId = anchor?.canvasGroupId ?? null;

    // Selection siblings (excluding anchor — Konva already moved it).
    const selSiblingIds = new Set(st.selectedShapeIds);
    selSiblingIds.delete(anchorId);

    // Canvas-group sheet siblings (any locked sheet is filtered later).
    const cgSheetIds = new Set<string>();
    if (cgId) {
      for (const sh of st.sheets) {
        if (sh.canvasGroupId === cgId) cgSheetIds.add(sh.id);
      }
    }
    // Canvas-group shape siblings — exclude the anchor and exclude any
    // shape whose parent sheet is also in the group (it'd ride along with
    // the sheet's translation; applying delta here too would double-move).
    const cgShapeIds = new Set<string>();
    if (cgId) {
      for (const s of st.shapes) {
        if (s.id === anchorId) continue;
        if (s.canvasGroupId !== cgId) continue;
        if (cgSheetIds.has(s.sheetId)) continue;
        cgShapeIds.add(s.id);
      }
    }

    const siblingShapeIds = new Set<string>([
      ...selSiblingIds,
      ...cgShapeIds,
    ]);

    // Shape pass — single setState so all sibling moves coalesce into one
    // React render. Locked shapes are skipped (lock = "no movement").
    if (siblingShapeIds.size > 0) {
      useStore.setState((s) => ({
        shapes: s.shapes.map((sh) =>
          siblingShapeIds.has(sh.id) && !sh.locked
            ? ({ ...sh, x: sh.x + ddx, y: sh.y + ddy } as Shape)
            : sh
        ),
      }));
    }

    // Sheet pass — uses setSheetPosition (raw write, no layoutSheetsRow).
    // Skip locked sheets so the lock primitive freezes them through drags.
    if (cgSheetIds.size > 0) {
      const setSheetPosition = st.setSheetPosition;
      for (const sid of cgSheetIds) {
        const sh = st.sheets.find((s) => s.id === sid);
        if (!sh || sh.locked) continue;
        setSheetPosition(sid, sh.x + ddx, sh.y + ddy);
      }
    }

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
        onDragEnter={(e) => {
          // React to file drags (uploads) and in-app view drags from the
          // RightSidebar. Anything else (text selections, links, etc.) is
          // ignored so we don't interfere with the browser's default UX.
          const isFile = e.dataTransfer.types.includes("Files");
          const isView = e.dataTransfer.types.includes(VIEW_DRAG_MIME);
          if (!isFile && !isView) return;
          e.preventDefault();
          if (isFile) setDragCounter((c) => c + 1);
        }}
        onDragOver={(e) => {
          const isFile = e.dataTransfer.types.includes("Files");
          const isView = e.dataTransfer.types.includes(VIEW_DRAG_MIME);
          if (!isFile && !isView) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          setDragCounter((c) => Math.max(0, c - 1));
        }}
        onDrop={(e) => {
          const isFile = e.dataTransfer.types.includes("Files");
          const isView = e.dataTransfer.types.includes(VIEW_DRAG_MIME);
          if (!isFile && !isView) return;
          e.preventDefault();
          if (isFile) setDragCounter(0);

          const world = clientToWorld(e.clientX, e.clientY);
          if (!world) return;
          // Hit-test the drop point against sheets; if inside one, use that
          // sheet. Otherwise fall back to the active sheet so the drop still
          // lands somewhere meaningful.
          const latestSheets = useStore.getState().sheets;
          const hitSheet = latestSheets.find(
            (s) =>
              world.worldX >= s.x &&
              world.worldX < s.x + s.width &&
              world.worldY >= s.y &&
              world.worldY < s.y + s.height
          );
          const targetSheetId = hitSheet?.id ?? activeSheetId ?? latestSheets[0]?.id;
          if (!targetSheetId) return;
          const baseSheet = hitSheet ?? latestSheets.find((s) => s.id === targetSheetId);
          // Convert world coords to sheet-local coords for the drop point.
          const sheetX = baseSheet ? world.worldX - baseSheet.x : world.worldX;
          const sheetY = baseSheet ? world.worldY - baseSheet.y : world.worldY;

          if (isView) {
            // The RightSidebar set the view id under VIEW_DRAG_MIME. Resolve
            // the live ViewItem from the store so a stale in-flight drag
            // can't insert a deleted view.
            const viewId = e.dataTransfer.getData(VIEW_DRAG_MIME);
            const view = useStore.getState().views.find((v) => v.id === viewId);
            if (!view) return;
            // Center the placement on the cursor so the user lands the view
            // exactly where they let go, instead of with the top-left at the
            // cursor (which feels off when the source thumbnail is small).
            insertViewShape(view, {
              sheetId: targetSheetId,
              x: sheetX,
              y: sheetY,
              center: true,
            });
            return;
          }

          const files = Array.from(e.dataTransfer.files).slice(0, 20);
          if (files.length === 0) return;
          files.forEach((f, i) => {
            void uploadImageFile(f, {
              sheetId: targetSheetId,
              x: sheetX + i * 20,
              y: sheetY + i * 20,
            });
          });
          if (e.dataTransfer.files.length > 20) {
            useStore
              .getState()
              .showToast("Dropped 20 of " + e.dataTransfer.files.length + " files (cap).", "info");
          }
        }}
      >
        <Stage
          ref={stageRef}
          width={stageW}
          height={stageH}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onContextMenu={onContextMenu}
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
                    onDragMove={(e) => {
                      // Mirror the chrome Group's live position onto its
                      // sibling per-sheet shape Group so the shapes visibly
                      // track the frame during the drag. Without this, the
                      // chrome would slide alone and shapes would snap to
                      // the new position only on drop — a jarring teleport.
                      const stage = e.target.getStage();
                      if (!stage) return;
                      const shapeGroup = stage.findOne(`#shapes-${s.id}`);
                      if (shapeGroup) {
                        shapeGroup.x(e.target.x());
                        shapeGroup.y(e.target.y());
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
                        // Solo sheet move: the sheet acts like a frame and
                        // carries its children. We ONLY update the sheet's
                        // x/y — child shape local coords stay as-is, so
                        // their WORLD position = sheet.x + shape.x now
                        // reflects the new sheet position (moved-with).
                        setSheetPosition(s.id, nx, ny);
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
                        group below. We keep them siblings (simpler hit
                        ordering + the rotation handle below stays above
                        shapes), but during a sheet drag the chrome's
                        onDragMove mirrors this Group's live x/y onto that
                        sibling so the shapes visibly follow the frame.
                        On drop, the sibling re-renders at the new sheet
                        position from the store. */}
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
                  sheet chrome so positions match. Stays a SIBLING (not a
                  child) of the chrome Group — but to give users the
                  "frame-move carries its children" feel, the chrome
                  Group's onDragMove imperatively mirrors its x/y onto
                  this Group (stage.findOne by the id below) so shapes
                  visibly track the frame during the drag. On drop,
                  sheet.x/y commits to the store and both Groups
                  re-render at the new position; we deliberately do NOT
                  compensate child shape local coords, so content ends up
                  in the new world position (moved-with-the-sheet). */}
              {sheets.map((s) => {
                const rotation = s.rotation ?? 0;
                const cx = s.x + s.width / 2;
                const cy = s.y + s.height / 2;
                const list = shapesBySheet.get(s.id) || [];
                if (list.length === 0) return null;
                return (
                  <Group
                    key={`shapes-${s.id}`}
                    id={`shapes-${s.id}`}
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

              {/* free board layer — shapes without a sheet.
                  Stickies are partitioned out and rendered AFTER non-stickies
                  in the same layer so they always sit on top of other board
                  shapes (canvas-level annotation invariant). The board layer
                  itself already renders after every per-sheet group, so
                  stickies end up above sheet content automatically. */}
              {(() => {
                const board = shapesBySheet.get("board") || [];
                const nonStickies = board.filter((s) => s.type !== "sticky");
                const stickies = board.filter((s) => s.type === "sticky");
                const renderOne = (sh: Shape) => (
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
                );
                return (
                  <>
                    {nonStickies.map(renderOne)}
                    {stickies.map(renderOne)}
                  </>
                );
              })()}
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
              {/* Crop overlay for the image currently in crop mode. Renders
                  inside world transform so handles move with pan/zoom. */}
              {croppingImageId && (() => {
                const sh = shapes.find((x) => x.id === croppingImageId);
                if (!sh || sh.type !== "image") return null;
                const parentSheet = sh.sheetId
                  ? sheets.find((s) => s.id === sh.sheetId)
                  : null;
                const absX = (parentSheet?.x ?? 0) + sh.x;
                const absY = (parentSheet?.y ?? 0) + sh.y;
                return (
                  <CropOverlay
                    shape={sh}
                    absX={absX}
                    absY={absY}
                    zoom={zoom}
                  />
                );
              })()}
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
                // Free rotation — any integer degree. The snap targets stay
                // wired (every 15°) but tolerance is 0 so they only act as
                // anchors when the user lands exactly on them. Precise angles
                // come from the editable angle badge below.
                rotationSnaps={Array.from({ length: 24 }, (_, i) => i * 15)}
                rotationSnapTolerance={0}
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
                onTransformStart={() => {
                  const tr = transformerRef.current;
                  const stage = stageRef.current;
                  if (!tr || !stage) return;
                  const anchor = tr.getActiveAnchor();
                  // Corner handles on images preserve aspect ratio —
                  // matches Figma/Sketch convention that photos resize
                  // proportionally when grabbed by a corner. Edge anchors
                  // stay free so one dimension can still be adjusted.
                  const isCorner =
                    anchor === "top-left" ||
                    anchor === "top-right" ||
                    anchor === "bottom-left" ||
                    anchor === "bottom-right";
                  const st = useStore.getState();
                  const hasImage = tr.nodes().some((n) => {
                    const sh = st.shapes.find((s) => s.id === n.id());
                    return sh?.type === "image";
                  });
                  tr.keepRatio(isCorner && hasImage);
                  if (anchor !== "rotater") return;
                  setIsRotating(true);
                  const rect = tr.getClientRect({ relativeTo: stage });
                  const node = tr.nodes()[0];
                  const angle = ((node?.rotation() ?? 0) % 360 + 360) % 360;
                  setRotBadge({
                    shapeId: node?.id() ?? "",
                    x: rect.x + rect.width / 2,
                    y: rect.y - 34,
                    angle,
                  });
                }}
                onTransform={() => {
                  const tr = transformerRef.current;
                  const stage = stageRef.current;
                  if (!tr || !stage) return;
                  if (tr.getActiveAnchor() !== "rotater") return;
                  const rect = tr.getClientRect({ relativeTo: stage });
                  const node = tr.nodes()[0];
                  const angle = ((node?.rotation() ?? 0) % 360 + 360) % 360;
                  setRotBadge({
                    shapeId: node?.id() ?? "",
                    x: rect.x + rect.width / 2,
                    y: rect.y - 34,
                    angle,
                  });
                }}
                onTransformEnd={() => {
                  setIsRotating(false);
                  const tr = transformerRef.current;
                  if (!tr) return;
                  // Reset keepRatio so the next drag re-evaluates based on its
                  // own active anchor (corner vs edge) and selection.
                  tr.keepRatio(false);
                  const nodes = tr.nodes();
                  for (const node of nodes) {
                    const id = node.id();
                    const sh = useStore
                      .getState()
                      .shapes.find((s) => s.id === id);
                    if (!sh) continue;
                    if (sh.type === "shape") {
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
                      // Text shapes default to auto-fit (overlay grows to match
                      // content). The instant the user grabs a transform handle
                      // we flip autoFit off so subsequent edits respect their
                      // chosen box and word-wrap inside it.
                      const textPatch = sh.text
                        ? { text: { ...sh.text, autoFit: false } }
                        : {};
                      updateShape(id, {
                        x: newX,
                        y: newY,
                        width: newW,
                        height: newH,
                        rotation: node.rotation(),
                        ...textPatch,
                      } as Partial<Shape>);
                    } else if (sh.type === "image") {
                      const sx = Math.abs(node.scaleX());
                      const sy = Math.abs(node.scaleY());
                      const newW = Math.max(3, sh.width * sx);
                      const newH = Math.max(3, sh.height * sy);
                      node.scaleX(1);
                      node.scaleY(1);
                      updateShape(id, {
                        x: node.x(),
                        y: node.y(),
                        width: newW,
                        height: newH,
                        rotation: node.rotation(),
                      } as Partial<Shape>);
                    } else if (sh.type === "pen") {
                      // Pens: we expose rotation + drag only (scale anchors
                      // are hidden by the effect that binds nodes). Reset
                      // any accidental scale so a second drag doesn't
                      // compound, and bake the final translation+rotation
                      // back to the store.
                      node.scaleX(1);
                      node.scaleY(1);
                      updateShape(id, {
                        x: node.x(),
                        y: node.y(),
                        rotation: node.rotation(),
                      } as Partial<Shape>);
                    }
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
        {rotBadge && (
          <AngleBadge
            shapeId={rotBadge.shapeId}
            x={rotBadge.x}
            y={rotBadge.y}
            angle={rotBadge.angle}
            readOnly={isRotating}
            onCommit={(deg) =>
              updateShape(rotBadge.shapeId, {
                rotation: ((deg % 360) + 360) % 360,
              } as Partial<Shape>)
            }
          />
        )}
        {dragCounter > 0 && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            style={{
              background: "rgba(13,148,136,0.08)",
              border: "3px dashed var(--accent)",
              zIndex: 40,
            }}
          >
            <div
              className="px-4 py-2 rounded-md text-sm font-medium"
              style={{
                background: "rgba(15,23,42,0.9)",
                color: "#e6fffb",
                border: "1px solid rgba(13,148,136,0.6)",
              }}
            >
              Drop image to upload
            </div>
          </div>
        )}
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

// Floating rotation badge above the selected shape. Read-only while a
// rotation drag is in progress (live degree readout); becomes an editable
// numeric input once the drag ends so the user can type any precise angle.
// Local state tracks the typed value so each keystroke doesn't fight the
// `angle` prop sync — `angle` only re-seeds the input when the underlying
// shape's rotation changes externally (drag, popover, undo).
function AngleBadge({
  shapeId,
  x,
  y,
  angle,
  readOnly,
  onCommit,
}: {
  shapeId: string;
  x: number;
  y: number;
  angle: number;
  readOnly: boolean;
  onCommit: (deg: number) => void;
}) {
  const [text, setText] = useState(String(Math.round(angle)));
  useEffect(() => {
    setText(String(Math.round(angle)));
  }, [shapeId, angle]);

  function commit() {
    const n = Number(text);
    if (!Number.isFinite(n)) {
      setText(String(Math.round(angle)));
      return;
    }
    onCommit(n);
  }

  const baseStyle: React.CSSProperties = {
    left: x,
    top: y,
    transform: "translateX(-50%)",
    background: "rgba(15,23,42,0.9)",
    color: "#e6fffb",
    border: "1px solid rgba(13,148,136,0.6)",
    zIndex: 50,
  };

  if (readOnly) {
    return (
      <div
        className="pointer-events-none absolute rounded-md px-2 py-1 text-xs font-medium tabular-nums"
        style={baseStyle}
      >
        {Math.round(angle)}°
      </div>
    );
  }

  return (
    <div
      className="absolute rounded-md flex items-center text-xs font-medium tabular-nums"
      style={baseStyle}
      // Stop mousedown from reaching the Stage so editing the badge doesn't
      // also clear the selection or start a marquee drag.
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        type="number"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setText(String(Math.round(angle)));
            (e.target as HTMLInputElement).blur();
          }
        }}
        onBlur={commit}
        className="bg-transparent outline-none w-10 text-right py-1 pl-1.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        aria-label="Rotation angle in degrees"
      />
      <span className="pr-1.5 select-none">°</span>
    </div>
  );
}

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

/**
 * Dash array for a LineShape's stroke pattern. Sibling to `dashFor` above
 * (which serves sheet borders via the four-variant `LineStyle`), but
 * scoped to the three-variant `LinePattern` ("solid" | "dashed" |
 * "dotted") owned by the Line tool.
 *
 * Unit handling: the returned array is expressed in whichever coordinate
 * space the caller's `renderStrokeWidth` lives in.
 *   • "world" strokes: dash values stay in world units. Konva's
 *     `scale(zoom)` transform then maps both stroke and dash onto the
 *     screen together, so the dash-to-stroke ratio is preserved.
 *   • "screen" strokes: stroke is pre-divided by zoom so it renders at a
 *     constant screen size. We divide the dash array by zoom for the
 *     same reason — otherwise patterns would balloon when zoomed in and
 *     compress to invisibility when zoomed out.
 *
 * Base lengths mirror the sheet-border `dashFor` formula so the two
 * surfaces show identical patterns at matching weights — a dashed line
 * at weight=3 looks like a dashed sheet-border at weight=3.
 */
function dashForLinePattern(
  pattern: LinePattern,
  baseStrokeWidth: number,
  unit: "world" | "screen",
  zoom: number,
): number[] | undefined {
  if (pattern === "solid") return undefined;
  const w = Math.max(0.5, baseStrokeWidth);
  const base =
    pattern === "dashed"
      ? [Math.max(4, w * 3), Math.max(3, w * 2)]
      : /* dotted */ [1, Math.max(2, w * 1.5)];
  if (unit === "screen") {
    const z = zoom || 1;
    return [base[0] / z, base[1] / z];
  }
  return base;
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
  // While an image is being cropped, hide its base render — the CropOverlay
  // draws the full natural image at frozen dimensions, so leaving this one
  // in place would show a stretched/duplicated copy under the overlay.
  const croppingImageId = useStore((s) => s.croppingImageId);
  // Active text-edit target. Sticky branch reads this to suppress the Konva
  // Text node for the band currently being edited (the HTML <textarea>
  // overlay is the only renderer in that state — leaving the Konva Text in
  // place would ghost the same characters underneath the textarea, looking
  // like double-typed text).
  const editingText = useStore((s) => s.editingText);
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
    // Cross-sheet reparenting: if the user dropped this shape over a
    // *different* sheet (or over empty board), update `shape.sheetId` so the
    // Layers panel re-groups it under the new parent. We compute the world
    // position from the node's absolute (stage) position by inverting the
    // worldGroup pan+zoom — this matches the convention used elsewhere in
    // this file (`(stageX - pan.x) / zoom`).
    const st = useStore.getState();
    const stageAbs = e.target.getAbsolutePosition();
    const worldX = (stageAbs.x - st.pan.x) / st.zoom;
    const worldY = (stageAbs.y - st.pan.y) / st.zoom;
    const dropSheet = [...st.sheets].reverse().find(
      (sh) =>
        worldX >= sh.x &&
        worldX <= sh.x + sh.width &&
        worldY >= sh.y &&
        worldY <= sh.y + sh.height,
    );
    const newSheetId = dropSheet?.id ?? "board";
    let finalPatch = patch;
    if (newSheetId !== shape.sheetId) {
      // Convert the absolute drop point into the new parent's local frame so
      // the shape stays visually where the user released it. For board the
      // local frame == world frame.
      const local = dropSheet
        ? worldToSheetLocalXY({ x: worldX, y: worldY }, dropSheet)
        : { x: worldX, y: worldY };
      finalPatch = {
        ...patch,
        x: local.x,
        y: local.y,
        sheetId: newSheetId,
      } as Partial<Shape>;
    }
    onChange(finalPatch);
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
        id={shape.id}
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
    // Dash array must live in the SAME coordinate space as renderStrokeWidth
    // — Konva applies the worldGroup's `scale(zoom)` transform to both, so
    // only if they share units will the dash-to-stroke proportion stay
    // constant across zooms. Formulas echo sheet-border `dashFor` so the
    // two surfaces render visually consistent patterns.
    //
    // Dotted + `lineCap="round"`: the 1-unit dash segment is drawn, then
    // the round cap extends it by strokeWidth/2 on each end — yielding a
    // circular dot of ~strokeWidth diameter. That's why "dotted" reads as
    // dots at weight=1 px @ 100% zoom, not as hairlines.
    const dash = dashForLinePattern(
      shape.pattern ?? "solid",
      shape.strokeWidth ?? 1,
      shape.strokeWidthUnit === "world" ? "world" : "screen",
      zoom,
    );
    // During the draw gesture, force a straight preview: elbow corners and
    // Bézier controls only snap in on mouseup. Without this, the elbow
    // corner jumps with every mouse move and feels like a flickering Z.
    const routing = isDrawing ? "straight" : (shape.routing ?? "straight");
    // "Rounded edge" lives in the Ends dropdown but is a property of the
    // stroke itself — `lineCap="round"` gives the line a hemispherical
    // terminus, while `"butt"` gives the default flat one. Konva applies
    // `lineCap` to both ends of a single `Line`/`Path`, so we can't cap
    // the two sides differently; we opt into round caps whenever
    // *either* end asks for it (acceptable limitation).
    //
    // Dotted patterns force `"round"` regardless — `dashForLinePattern`
    // emits a 1-unit dash whose circular dot is produced by the round
    // cap extending it by strokeWidth/2 on each end. Switching to butt
    // would collapse dotted strokes to hairlines.
    const isDotted = (shape.pattern ?? "solid") === "dotted";
    const wantsRoundedEdge =
      shape.startMarker === "roundedEdge" ||
      shape.endMarker === "roundedEdge";
    const lineCap: "round" | "butt" =
      isDotted || wantsRoundedEdge ? "round" : "butt";
    // Click-to-select forgiveness. Konva only treats a pointer hit on
    // pixels the stroke actually covers, so a 1-2 px line is nearly
    // impossible to click without missing. `hitStrokeWidth` expands the
    // invisible hit region without touching the visible stroke — same
    // coord space as `strokeWidth` (world units inside the worldGroup),
    // so we pad by screen pixels via `/zoom`.
    //
    // Floor: 18 screen px minimum so even a hairline has a comfortable
    // target. Padding: 12 screen px added to the actual stroke so thick
    // strokes still grow their hit area proportionally. This mirrors
    // the GuideLayer / CommentPinLayer treatment.
    const hitStrokeWidth = Math.max(
      renderStrokeWidth + 12 / zoom,
      18 / zoom,
    );
    const commonProps = {
      // id on every sub-renderer (straight Line / elbow KPath / curved KPath
      // / arc KPath / degenerate Line) so `findShapeIdUnder` can resolve a
      // right-click directly on the stroke to this shape, not just through
      // an ancestor group.
      id: shape.id,
      stroke: shape.stroke,
      strokeWidth: renderStrokeWidth,
      hitStrokeWidth,
      opacity: shape.opacity ?? 1,
      lineCap,
      lineJoin: "round" as const,
      dash,
      onClick: onSelect,
      onTap: onSelect,
    };
    const primary =
      routing === "curved" && shape.points.length >= 4 ? (
        (() => {
          // Multi-anchor cubic Bézier spline. `resolveCurveAnchors`
          // returns `shape.curveAnchors` when defined; otherwise derives
          // a 2-anchor spline from the legacy (curvature, curvature2)
          // scalars whose rendered path is byte-identical to the old
          // two-pill renderer. `autoSmoothTangents` fills in any missing
          // in/out handles so interior bends read as C1-smooth joins.
          const anchors = autoSmoothTangents(resolveCurveAnchors(shape));
          const d = computeMultiAnchorPath(anchors);
          return <KPath data={d} {...commonProps} />;
        })()
      ) : routing === "arc" && shape.points.length >= 4 ? (
        (() => {
          // Circular arc through three points. `computeArcPath` emits
          // a single SVG `A` command; for collinear triples (or freshly
          // dragged-to-straight arcs) it returns `degenerate: true` and
          // we render a plain Line for clean stroke joining. The mid
          // is derived at render time for length-4 (legacy / just
          // drawn) and read from `points[2..3]` for length-≥6.
          const { d, degenerate } = computeArcPath(shape.points);
          if (degenerate) {
            const n = shape.points.length;
            return (
              <Line
                points={[
                  shape.points[0],
                  shape.points[1],
                  shape.points[n - 2],
                  shape.points[n - 1],
                ]}
                {...commonProps}
              />
            );
          }
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
    // Start / end marker glyphs painted on top of the path. Rendered
    // during the draw gesture too so the user sees what they're going
    // to get as soon as they lift the mouse. The `routingOverride` mirrors
    // the `isDrawing ? "straight"` short-circuit above so the marker's
    // tangent agrees with the rendered path during an in-progress draw.
    const markers = (
      <LineMarkerEnds
        shape={shape}
        zoom={zoom}
        routingOverride={isDrawing ? "straight" : undefined}
      />
    );
    // Wrapping Group gives the line a single draggable surface — a pointer
    // on the stroke (via `hitStrokeWidth`) or a marker glyph translates the
    // whole shape. On drop, the delta is baked back into `shape.points`
    // (and `curveAnchors`, if present) so the stored geometry stays
    // canonical — LineHandles / LineMarkerEnds read `shape.points` directly
    // and would drift if we left the Group transform non-zero after the
    // gesture. Endpoint / segment / curvature handles remain individually
    // draggable: Konva only starts the deepest draggable under the pointer,
    // so grabbing a handle reshapes the line while grabbing the stroke
    // moves it.
    const canDragLine = draggable && !shape.locked && !isDrawing;
    const handleLineDragEnd = (e: KonvaEventObject<DragEvent>) => {
      e.cancelBubble = true;
      const dx = e.target.x();
      const dy = e.target.y();
      // Snap the Group back to origin synchronously. React's re-render will
      // pull the baked points into the nested Line before Konva's next
      // animation-frame paint, so the user sees one continuous motion.
      e.target.position({ x: 0, y: 0 });
      if (dx === 0 && dy === 0) {
        onGroupDragEnd?.();
        return;
      }
      const nextPoints = shape.points.map((v, i) =>
        i % 2 === 0 ? v + dx : v + dy,
      );
      const patch: Partial<LineShape> = { points: nextPoints };
      if (shape.curveAnchors) {
        patch.curveAnchors = shape.curveAnchors.map((a) => ({
          ...a,
          x: a.x + dx,
          y: a.y + dy,
        }));
      }
      onChange(patch);
      onGroupDragEnd?.();
    };
    // Cursor affordance: hovering a draggable line swaps in the "move"
    // glyph so the user sees the stroke is grabbable. Konva surfaces the
    // cursor via the Stage container's CSS; the Canvas root otherwise pins
    // it to `default` in select mode — we override on enter and restore on
    // leave. Locked / undraggable lines keep the normal cursor (no false
    // affordance).
    const handleLineMouseEnter = (e: KonvaEventObject<MouseEvent>) => {
      if (!canDragLine) return;
      const container = e.target.getStage()?.container();
      if (container) container.style.cursor = "move";
    };
    const handleLineMouseLeave = (e: KonvaEventObject<MouseEvent>) => {
      const container = e.target.getStage()?.container();
      if (container) container.style.cursor = "default";
    };
    const groupHandlers = {
      draggable: canDragLine,
      onDragStart: handleDragStart,
      onDragMove: handleDragMove,
      onDragEnd: handleLineDragEnd,
      onMouseEnter: handleLineMouseEnter,
      onMouseLeave: handleLineMouseLeave,
    };
    if (!selected || isDrawing)
      return (
        <Group {...groupHandlers}>
          {primary}
          {markers}
        </Group>
      );
    return (
      <Group {...groupHandlers}>
        {primary}
        {markers}
        <LineHandles shape={shape} zoom={zoom} accent={accent} />
      </Group>
    );
  }
  if (shape.type === "sticky") {
    // Two-band layout: body (top → middle, wraps + truncates) and footer
    // (author · date, single-line w/ ellipsis). The header band was removed
    // by product direction — legacy stickies that still carry a `header`
    // field simply ignore it (it's not rendered, but the data is preserved
    // so old saves round-trip without loss).
    //
    // Inside the body we still want a "title-ish" cue without forcing a
    // separate field on the data model: the FIRST line of body.text is
    // rendered at TITLE_FONT_SIZE (bold), every subsequent line at
    // bodyC.fontSize. Splitting on the first "\n" keeps the underlying
    // string a plain body — no schema change, no header-vs-body branching.
    //
    // Legacy stickies that only carry `shape.text` fall back to it as the
    // body content so old saves keep displaying.
    const bg = shape.bgColor ?? DEFAULT_STICKY_BG;
    // bgOpacity is optional + defaults to 1. The picker can dial this between
    // 0 (fully transparent) and 1 (fully opaque). We apply it to the fill
    // Rect ONLY (the shadow + child Text nodes stay fully opaque so the body
    // text doesn't fade with the background — readability beats aesthetic
    // consistency here).
    const bgAlpha = Math.max(0, Math.min(1, shape.bgOpacity ?? 1));
    const padX = 12;
    const padY = 10;
    const footerH = 14;
    const gap = 6;
    const innerW = Math.max(1, shape.width - padX * 2);
    const bodyTop = padY;
    const bodyH = Math.max(0, shape.height - padY * 2 - gap - footerH);
    const bodyC = shape.body;
    // Suppress the Konva Text node for the body when its overlay textarea is
    // active. Leaving the Konva Text in place would ghost the same
    // characters underneath the textarea, looking like double-typed text.
    const editingBody =
      editingText?.kind === "sticky" &&
      editingText.id === shape.id &&
      editingText.field === "body";
    const bodyText = bodyC?.text ?? shape.text ?? "";
    const showBody = bodyText.length > 0 && !editingBody;
    // First-line "title" rendering. 24px bold for the first line; the rest
    // of the body wraps at the body's own font size (default 12px).
    const TITLE_FONT_SIZE = 24;
    const REST_FONT_SIZE = bodyC?.fontSize ?? 12;
    const TITLE_LINE_H = Math.ceil(TITLE_FONT_SIZE * 1.2);
    const TITLE_REST_GAP = 4;
    const allLines = bodyText.split("\n");
    const titleLine = allLines[0] ?? "";
    const restLines = allLines.slice(1);
    const hasRest = restLines.length > 0;
    const restText = bodyC
      ? // Re-apply list formatting to the body lines minus the title — we
        // pass slice(1) to preserve list numbering offset relative to the
        // sub-body the user actually sees.
        formatListLines(
          restLines.join("\n"),
          bodyC.bullets,
          bodyC.indent ?? 0,
          bodyC.bulletStyle,
          bodyC.numberStyle
        )
      : restLines.join("\n");
    const restTop = bodyTop + TITLE_LINE_H + TITLE_REST_GAP;
    const restH = Math.max(0, bodyH - TITLE_LINE_H - TITLE_REST_GAP);
    const users = useStore.getState().users;
    const footerText = `${authorName(shape.authorId, users)} · ${shortDate(
      shape.createdAt
    )}`;
    return (
      <Group
        id={shape.id}
        x={shape.x}
        y={shape.y}
        rotation={shape.rotation ?? 0}
        draggable={draggable && !shape.locked}
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={() => {
          // Double-click enters body-edit by default.
          if (shape.locked) return;
          useStore.getState().beginTextEdit({
            kind: "sticky",
            id: shape.id,
            field: "body",
          });
        }}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={(e) =>
          handleDragEndWith(e, { x: e.target.x(), y: e.target.y() })
        }
      >
        <Rect
          width={shape.width}
          height={shape.height}
          fill={bg}
          opacity={bgAlpha}
          stroke={selected ? (stroke ?? "#0d9488") : "rgba(0,0,0,0.08)"}
          strokeWidth={selected ? 2 : 1}
          cornerRadius={6}
          shadowColor="rgba(0,0,0,0.18)"
          shadowBlur={10}
          shadowOffset={{ x: 0, y: 4 }}
        />
        {showBody && bodyH > 0 && (
          <>
            {/* Title — first line of body, painted at TITLE_FONT_SIZE bold.
                Forced bold regardless of bodyC.bold so the title visibly
                "indicates a header" even if the user toggled the body bold
                state off via the format bar. */}
            <Text
              text={titleLine}
              x={padX}
              y={bodyTop}
              width={innerW}
              height={TITLE_LINE_H}
              fontSize={TITLE_FONT_SIZE}
              fontFamily={bodyC?.font ?? "Inter, sans-serif"}
              fontStyle={fontStyleFor(true, bodyC?.italic ?? false)}
              textDecoration={bodyC?.underline ? "underline" : ""}
              align={bodyC?.align ?? "left"}
              fill={bodyC?.color ?? "#1c1e25"}
              wrap="none"
              ellipsis
              listening={false}
            />
            {/* Rest — wraps and ellipsises within the remaining vertical
                space. Skip if the body is single-line so the title sits
                naturally at the top of the card without a hollow band
                taking up space below it. */}
            {hasRest && restH > 0 && (
              <Text
                text={restText}
                x={padX}
                y={restTop}
                width={innerW}
                height={restH}
                fontSize={REST_FONT_SIZE}
                fontFamily={bodyC?.font ?? "Inter, sans-serif"}
                fontStyle={fontStyleFor(
                  bodyC?.bold ?? false,
                  bodyC?.italic ?? false
                )}
                textDecoration={bodyC?.underline ? "underline" : ""}
                align={bodyC?.align ?? "left"}
                fill={bodyC?.color ?? "#1c1e25"}
                wrap="word"
                ellipsis
                listening={false}
              />
            )}
          </>
        )}
        <Text
          text={footerText}
          x={padX}
          y={shape.height - padY - footerH}
          width={innerW}
          height={footerH}
          fontSize={10}
          fontFamily="Inter, sans-serif"
          fill="rgba(28,30,37,0.55)"
          wrap="none"
          ellipsis
          listening={false}
        />
      </Group>
    );
  }
  if (shape.type === "image") {
    if (croppingImageId === shape.id) return null;
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

  // Quantize a 2D direction to one of the four CSS resize cursors that
  // show two opposing arrows along that axis. Two-way axis is symmetric
  // (a vector and its 180° rotation share the same orientation), so we
  // fold the angle into [0, π) before snapping to the nearest 45°
  // boundary. Used to dress every round handle (endpoints, anchors,
  // arc-mid) with a cursor that matches the line's local direction.
  const cursorForVector = (dx: number, dy: number): string => {
    if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) return "ew-resize";
    let angle = Math.atan2(dy, dx);
    if (angle < 0) angle += Math.PI;
    const slot = Math.round(angle / (Math.PI / 4)) % 4;
    // 0 → 0°   horizontal      ↔     ew-resize
    // 1 → 45°  NW-SE diagonal  ↘↖    nwse-resize
    // 2 → 90°  vertical        ↕     ns-resize
    // 3 → 135° NE-SW diagonal  ↗↙    nesw-resize
    return ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"][slot];
  };

  const handleNode = (opts: {
    key: string;
    x: number;
    y: number;
    onStart: () => void;
    onMove: (
      e: KonvaEventObject<DragEvent>,
      worldPt?: { x: number; y: number },
    ) => void;
    onEnd?: () => void;
    fill?: string;
    /** "circle" (default) — round endpoint/corner handle.
     *  "pill" — fully-rounded rectangle for segment-midpoint handles. */
    glyph?: "circle" | "pill";
    /** Orientation of the pill's long axis. Ignored for circle.
     *  "h" = horizontal long axis, "v" = vertical long axis. */
    pillAxis?: "h" | "v";
    /** When set, `dragBoundFunc` locks the handle's rendered position to
     *  this world-coord point so it stays on the curve while the user drags
     *  far off-axis. `onMove` still receives the raw pointer (converted to
     *  world coords via the parent's inverse transform) as its 2nd arg. */
    pin?: { x: number; y: number };
    /** CSS cursor to show while the pointer is over this handle. Defaults
     *  to "move" — appropriate for round endpoints / anchors / arc-mid
     *  which drag freely in 2D. Pill handles override with the
     *  perpendicular two-way resize cursor ("ns-resize" / "ew-resize") so
     *  the cursor telegraphs the drag axis the pill responds to. */
    cursor?: string;
  }) => {
    const isPill = opts.glyph === "pill";
    const pw = isPill
      ? opts.pillAxis === "v" ? pillShort : pillLong
      : 0;
    const ph = isPill
      ? opts.pillAxis === "v" ? pillLong : pillShort
      : 0;
    const pin = opts.pin;
    const cursor = opts.cursor ?? "move";
    return (
      <Group
        key={opts.key}
        x={opts.x}
        y={opts.y}
        draggable
        dragBoundFunc={pin ? function (this: Konva.Group) {
          const parent = this.getParent();
          if (!parent) return this.absolutePosition();
          return parent.getAbsoluteTransform().point(pin);
        } : undefined}
        onMouseDown={(e) => {
          e.cancelBubble = true;
        }}
        onMouseEnter={(e) => {
          // Konva fires enter outside-in, so this handler runs AFTER the
          // wrapping line group's mouseenter — its cursor wins.
          const container = e.target.getStage()?.container();
          if (container) container.style.cursor = cursor;
        }}
        onMouseLeave={(e) => {
          // Hand the cursor back to the parent line group's "move"
          // affordance — handles only render when the line is selected, so
          // we're still inside its hit area. If the pointer also leaves the
          // line group, its onMouseLeave fires next and resets to "default".
          const container = e.target.getStage()?.container();
          if (container) container.style.cursor = "move";
        }}
        onDragStart={(e) => {
          e.cancelBubble = true;
          opts.onStart();
        }}
        onDragMove={(e) => {
          e.cancelBubble = true;
          let worldPt: { x: number; y: number } | undefined;
          if (pin) {
            const stage = e.target.getStage();
            const pointer = stage?.getPointerPosition();
            const parent = e.target.getParent();
            if (pointer && parent) {
              worldPt = parent
                .getAbsoluteTransform()
                .copy()
                .invert()
                .point(pointer);
            }
          }
          opts.onMove(e, worldPt);
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

  // ─── Straight-line branch ──────────────────────────────────────────
  // Two endpoint circles acting directly on `points[0..1]` and
  // `points[n-2..n-1]`. Straight lines have no interior shape state
  // to edit, so there's nothing else to render.
  if (routing === "straight") {
    // Both endpoints share the line's overall direction — quantized to the
    // nearest two-way axis so the cursor matches the rendered orientation.
    const straightCursor = cursorForVector(
      pts[n - 2] - pts[0],
      pts[n - 1] - pts[1],
    );
    nodes.push(handleNode({
      key: "start",
      x: pts[0],
      y: pts[1],
      cursor: straightCursor,
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
      cursor: straightCursor,
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
    return <>{nodes}</>;
  }

  // ─── Curved-line branch — multi-anchor spline ──────────────────────
  // One draggable circle per anchor. Each anchor has its own (x, y),
  // so moving one anchor never touches the others' world positions —
  // full independence between endpoints and every interior bend.
  //
  // Legacy curves (no `curveAnchors`; only `curvature` / `curvature2`)
  // are resolved at render time by `resolveCurveAnchors` to a three-
  // anchor spline (start + midpoint + end) whose path is byte-identical
  // to the old two-pill renderer. On the first interactive drag,
  // `ensureUpgraded` persists that three-anchor form under
  // `curveAnchors`; subsequent reads go straight to the stored array.
  // `syncPointsFromAnchors` keeps `points` aligned with the endpoints
  // so bbox / selection / elbow-migration keep working unchanged.
  if (routing === "curved") {
    const smoothed = autoSmoothTangents(resolveCurveAnchors(shape));
    const na = smoothed.length;
    if (na < 2) return <>{nodes}</>;

    const ensureUpgraded = (): CurveAnchor[] => {
      const cur = useStore.getState().shapes.find((x) => x.id === shape.id);
      if (!cur || cur.type !== "line") return smoothed;
      if (cur.curveAnchors && cur.curveAnchors.length >= 2) {
        return cur.curveAnchors;
      }
      // Resolve from the live shape so the upgrade reflects any
      // endpoint edits that happened between mount and the first drag.
      const upgraded = autoSmoothTangents(resolveCurveAnchors(cur));
      updateShape(shape.id, {
        curveAnchors: upgraded,
        points: syncPointsFromAnchors(upgraded),
      } as Partial<Shape>);
      return upgraded;
    };

    for (let i = 0; i < na; i++) {
      const idx = i;
      const a = smoothed[idx];
      // Cursor follows the local tangent — chord to the next anchor for
      // every anchor except the last, which falls back to the chord from
      // the previous anchor. Captures the curve's rendered direction at
      // the anchor without wading into Bézier-tangent math.
      const neighbor =
        idx < na - 1 ? smoothed[idx + 1] : smoothed[idx - 1];
      const dx = idx < na - 1 ? neighbor.x - a.x : a.x - neighbor.x;
      const dy = idx < na - 1 ? neighbor.y - a.y : a.y - neighbor.y;
      nodes.push(handleNode({
        key: `anchor-${idx}`,
        x: a.x,
        y: a.y,
        cursor: cursorForVector(dx, dy),
        onStart: () => beginCoalesce(gestureKey(`anchor-${idx}`)),
        onMove: (e) => {
          const base = ensureUpgraded();
          if (idx >= base.length) return;
          const next = base.slice();
          next[idx] = {
            ...next[idx],
            x: e.target.x(),
            y: e.target.y(),
          };
          updateShape(shape.id, {
            curveAnchors: next,
            points: syncPointsFromAnchors(next),
          } as Partial<Shape>);
        },
      }));
    }

    // ─── Per-segment midpoint pills ──────────────────────────────────
    // One pill per cubic segment, sitting at the on-curve point
    // B(0.5) = (a + b)/2 + (3/8)·(oH + iH), where oH is a.outHandle
    // and iH is b.inHandle. Dragging the pill bends ONLY that segment
    // by splitting the required sum-delta evenly between oH and iH —
    // the two bordering anchors' positions are untouched, and the two
    // bordering anchors' *other-side* tangents (a.inHandle / b.outHandle)
    // are also untouched, so neighbouring segments stay put. This gives
    // the "pill moves only its own segment" behavior the user asked for.
    for (let i = 0; i < na - 1; i++) {
      const segIdx = i;
      const a = smoothed[segIdx];
      const b = smoothed[segIdx + 1];
      const oH = a.outHandle ?? { dx: 0, dy: 0 };
      const iH = b.inHandle ?? { dx: 0, dy: 0 };
      const midX = (a.x + b.x) / 2 + (3 / 8) * (oH.dx + iH.dx);
      const midY = (a.y + b.y) / 2 + (3 / 8) * (oH.dy + iH.dy);
      // Orient pill perpendicular to the chord so it reads as a "grab
      // the belly of the curve" affordance — same heuristic as elbow
      // segment-midpoint pills. Diagonal chord → vertical pill.
      const chordAxis = segmentAxis({ x: a.x, y: a.y }, { x: b.x, y: b.y });
      const pillAxis: "h" | "v" =
        chordAxis === "h" ? "v" : chordAxis === "v" ? "h" : "v";
      nodes.push(handleNode({
        key: `pill-${segIdx}`,
        x: midX,
        y: midY,
        glyph: "pill",
        pillAxis,
        // The pill primarily moves perpendicular to the chord (that's the
        // direction the curve bends). Show the matching two-way resize
        // cursor — `ns-resize` for a horizontal chord (drag up/down),
        // `ew-resize` for a vertical chord (drag left/right). Diagonal /
        // degenerate chords fall back to plain "move".
        cursor:
          chordAxis === "h"
            ? "ns-resize"
            : chordAxis === "v"
              ? "ew-resize"
              : "move",
        onStart: () => beginCoalesce(gestureKey(`pill-${segIdx}`)),
        onMove: (e) => {
          const base = ensureUpgraded();
          if (segIdx + 1 >= base.length) return;
          const pA = base[segIdx];
          const pB = base[segIdx + 1];
          const currOH = pA.outHandle ?? { dx: 0, dy: 0 };
          const currIH = pB.inHandle ?? { dx: 0, dy: 0 };
          const targetX = e.target.x();
          const targetY = e.target.y();
          const cmx = (pA.x + pB.x) / 2;
          const cmy = (pA.y + pB.y) / 2;
          // Solve (3/8)·(oH + iH) = target − chord-midpoint
          //       ⇒ oH + iH = (8/3) · (target − chord-midpoint).
          // Split the delta evenly between the two handles so the
          // tangent change is symmetric (C1 feel).
          const neededSumX = (8 / 3) * (targetX - cmx);
          const neededSumY = (8 / 3) * (targetY - cmy);
          const currSumX = currOH.dx + currIH.dx;
          const currSumY = currOH.dy + currIH.dy;
          const deltaHalfX = (neededSumX - currSumX) / 2;
          const deltaHalfY = (neededSumY - currSumY) / 2;
          const next = base.slice();
          next[segIdx] = {
            ...pA,
            outHandle: {
              dx: currOH.dx + deltaHalfX,
              dy: currOH.dy + deltaHalfY,
            },
          };
          next[segIdx + 1] = {
            ...pB,
            inHandle: {
              dx: currIH.dx + deltaHalfX,
              dy: currIH.dy + deltaHalfY,
            },
          };
          updateShape(shape.id, {
            curveAnchors: next,
            points: syncPointsFromAnchors(next),
          } as Partial<Shape>);
        },
      }));
    }

    return <>{nodes}</>;
  }

  // ─── Arc branch — three-point circular arc ─────────────────────────
  // Start + end circles act directly on `points[0..1]` and
  // `points[n-2..n-1]`. A single on-curve pill at the mid-point reshapes
  // the arc in any direction — the pill sits on the arc by definition
  // (the arc is determined by the three points), so no `pin` is needed.
  //
  // Freshly-drawn arcs arrive as length-4 `[sx, sy, ex, ey]`;
  // `resolveArcPoints` derives a default mid (perpendicular offset,
  // 0.25 × chord length) at render time, and the first interactive
  // handle-drag upgrades stored `points` to length-6 so the mid
  // persists across sessions. This mirrors the elbow lazy-migration
  // pattern one row down.
  if (routing === "arc") {
    const { s, m, e } = resolveArcPoints(pts);

    const ensureArcMigrated = (): number[] => {
      const cur = useStore.getState().shapes.find((x) => x.id === shape.id);
      if (!cur || cur.type !== "line") return pts.slice();
      if (cur.points.length >= 6) return cur.points.slice();
      // Re-resolve from the live shape so the upgrade reflects any
      // endpoint edits that happened between mount and the first drag.
      const live = resolveArcPoints(cur.points);
      const expanded = [live.s.x, live.s.y, live.m.x, live.m.y, live.e.x, live.e.y];
      updateShape(shape.id, { points: expanded } as Partial<Shape>);
      return expanded;
    };

    // Endpoints inherit the chord's orientation; the mid-point's natural
    // bend direction is perpendicular to the chord (rotate the chord
    // vector 90° to get the perpendicular, sign-irrelevant for two-way).
    const arcChordDx = e.x - s.x;
    const arcChordDy = e.y - s.y;
    const arcEndpointCursor = cursorForVector(arcChordDx, arcChordDy);
    const arcMidCursor = cursorForVector(arcChordDy, -arcChordDx);

    // Start endpoint.
    nodes.push(handleNode({
      key: "arc-start",
      x: s.x,
      y: s.y,
      cursor: arcEndpointCursor,
      onStart: () => beginCoalesce(gestureKey("arc-start")),
      onMove: (ev) => {
        const base = ensureArcMigrated();
        base[0] = ev.target.x();
        base[1] = ev.target.y();
        updateShape(shape.id, { points: base } as Partial<Shape>);
      },
    }));

    // End endpoint.
    nodes.push(handleNode({
      key: "arc-end",
      x: e.x,
      y: e.y,
      cursor: arcEndpointCursor,
      onStart: () => beginCoalesce(gestureKey("arc-end")),
      onMove: (ev) => {
        const base = ensureArcMigrated();
        const m2 = base.length;
        base[m2 - 2] = ev.target.x();
        base[m2 - 1] = ev.target.y();
        updateShape(shape.id, { points: base } as Partial<Shape>);
      },
    }));

    // Mid-point dot — on-arc by definition (the arc is determined by
    // the three points). Filled-solid accent colour so it reads as "a
    // point fixed to the line" rather than a floating ring; the white-
    // fill hollow style is reserved for endpoints. Free-direction
    // drag: the pointer position becomes the new mid; the arc
    // recircumscribes through it, so the dot and the arc always
    // coincide during and after the drag.
    nodes.push(handleNode({
      key: "arc-mid",
      x: m.x,
      y: m.y,
      fill: accent,
      cursor: arcMidCursor,
      onStart: () => beginCoalesce(gestureKey("arc-mid")),
      onMove: (ev) => {
        const base = ensureArcMigrated();
        base[2] = ev.target.x();
        base[3] = ev.target.y();
        updateShape(shape.id, { points: base } as Partial<Shape>);
      },
    }));

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
      // Cursor follows the adjacent segment's axis — the polyline
      // rebuild inserts a stub when the user drags off-axis, so the
      // initial drag direction the user intuits IS along this axis.
      cursor:
        firstAxis === "h"
          ? "ew-resize"
          : firstAxis === "v"
            ? "ns-resize"
            : "ew-resize",
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
      cursor:
        lastAxis === "h"
          ? "ew-resize"
          : lastAxis === "v"
            ? "ns-resize"
            : "ew-resize",
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
      // Elbow pills slide perpendicular to their segment. Match the
      // cursor to that axis so the user sees a two-way arrow pointing
      // along the actual drag direction.
      cursor: axis === "h" ? "ns-resize" : "ew-resize",
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
  // Konva's default hit area is the *visible* stroke, so a 4-px pen line
  // gives a 4-px click target — basically un-grabbable on a trackpad. Give
  // every pen stroke a consistent ~18-screen-px hit corridor so users can
  // click anywhere near the line and select it. Divide by zoom so the
  // corridor scales with the world group and stays 18 px on screen at any
  // zoom level. Clamped to never be thinner than the rendered stroke
  // (otherwise highlighter strokes would have a *smaller* hit area than
  // their visible body, which would feel buggy).
  const hitStrokeWidth = Math.max(renderStrokeWidth, 18 / zoom);

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
      // id on the outer Group so `findShapeIdUnder` (which walks Konva
      // ancestors) resolves a right-click on the inner <Line> stroke or
      // erase-mark <Circle> up to this pen shape.
      id={shape.id}
      ref={groupRef}
      x={shape.x}
      y={shape.y}
      rotation={shape.rotation ?? 0}
      draggable={draggable}
      onClick={onSelect}
      onTap={onSelect}
      // Show the 4-direction "move" cursor only while ACTIVELY dragging
      // — not on hover. Hover shows the OS default arrow so the canvas
      // feels like every other design tool. onDragStart sets the
      // imperative cursor on the Konva container; onDragEnd clears it so
      // the wrapper div's tool-based cursor takes over again. We wrap
      // the parent-supplied drag handlers rather than replacing them so
      // bubble-cancel + onGroupDrag* still fire.
      onDragStart={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = "move";
        onDragStart(e);
      }}
      onDragMove={onDragMove}
      onDragEnd={(e) => {
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = "";
        onDragEnd(e);
      }}
    >
      <Line
        points={shape.points}
        stroke={shape.stroke}
        strokeWidth={renderStrokeWidth}
        hitStrokeWidth={hitStrokeWidth}
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
  // Border precedence: user's enabled border > selection ring > none.
  const style = shape.style;
  const borderOn = !!style?.borderEnabled;
  const stroke = borderOn
    ? style!.borderColor
    : selected
      ? accent
      : undefined;
  const strokeWidth = borderOn
    ? style!.borderWeight
    : selected
      ? 2
      : 0;
  const dash = borderOn
    ? dashFor(style!.borderStyle, style!.borderWeight)
    : undefined;

  // Apply crop via Konva's native crop props when present. Crop is stored
  // in natural-pixel space, so the image draws at (x,y,width,height) but
  // samples only the cropped region of the source.
  const crop = style?.crop;
  const cropProps = crop
    ? {
        crop: {
          x: crop.x,
          y: crop.y,
          width: crop.w,
          height: crop.h,
        },
      }
    : {};
  return (
    <KImage
      id={shape.id}
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      rotation={shape.rotation ?? 0}
      image={img}
      stroke={stroke}
      strokeWidth={strokeWidth}
      dash={dash}
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
      {...cropProps}
    />
  );
}

/**
 * Inline crop UI for an image in crop mode. Renders a full-opacity preview of
 * the un-cropped image, a dark scrim outside the crop rect, and 8 handles
 * (corners + mid-edges) that write into `setImageCrop` in natural-pixel space.
 *
 * Coordinates: the overlay sits inside the world-transform Group, so
 * (absX, absY) are the shape's position in world space (accounting for any
 * parent sheet offset). Handle positions are derived from the crop rect in
 * natural-pixel space, converted to world space via the shape-to-natural ratio.
 */
function CropOverlay({
  shape,
  absX,
  absY,
  zoom,
}: {
  shape: ImageShape;
  absX: number;
  absY: number;
  zoom: number;
}) {
  const [img] = useImage(shape.src);
  const setImageCrop = useStore((s) => s.setImageCrop);
  const endImageCrop = useStore((s) => s.endImageCrop);
  const cropAspectRatio = useStore((s) => s.cropAspectRatio);
  const session = useStore((s) => s.cropSessionPreview);
  const nw = shape.naturalWidth || img?.naturalWidth || shape.width;
  const nh = shape.naturalHeight || img?.naturalHeight || shape.height;
  // Current crop in natural-pixel space. Default to full image if absent.
  const crop = shape.style?.crop ?? { x: 0, y: 0, w: nw, h: nh };
  const rotation = shape.rotation ?? 0;

  // Preview geometry is frozen at `beginImageCrop` so the full natural image
  // stays put while the user drags handles — only the crop rect, scrim, and
  // handles change. Without this, the preview would rescale every tick
  // (previewW = shape.width * nw / crop.w) and the image would appear to
  // zoom under the cursor. Falls back to the live-derived values only for
  // the first render race before the store set() commits.
  const previewW =
    session?.width ?? shape.width * (nw / Math.max(1, crop.w));
  const previewH =
    session?.height ?? shape.height * (nh / Math.max(1, crop.h));
  // absX/Y are the shape's current world top-left. The preview's top-left
  // is offset back by however much the begin-time crop skipped into the
  // image, so the visible (begin-time cropped) region initially overlays
  // exactly where the shape was rendering.
  const previewWorldX =
    absX + (session?.offsetX ?? -(crop.x / nw) * previewW);
  const previewWorldY =
    absY + (session?.offsetY ?? -(crop.y / nh) * previewH);

  // Children render in a preview-local frame where (0, 0) is the preview
  // top-left and (previewW, previewH) is bottom-right. The outer Group
  // translates to the preview center in world space and applies rotation
  // so shape.rotation live-previews during crop.
  const cropLocalX = (crop.x / nw) * previewW;
  const cropLocalY = (crop.y / nh) * previewH;
  const cropLocalW = (crop.w / nw) * previewW;
  const cropLocalH = (crop.h / nh) * previewH;
  const handleSize = 10 / zoom;

  // Convert a preview-local coord to natural-pixel space.
  function localToNatural(lx: number, ly: number) {
    return {
      x: (lx / previewW) * nw,
      y: (ly / previewH) * nh,
    };
  }

  // Freeform commit: clamp into image bounds with a 5px floor.
  function commitFreeCrop(newCrop: {
    x: number;
    y: number;
    w: number;
    h: number;
  }) {
    const x = Math.max(0, Math.min(nw - 5, newCrop.x));
    const y = Math.max(0, Math.min(nh - 5, newCrop.y));
    const w = Math.max(5, Math.min(nw - x, newCrop.w));
    const h = Math.max(5, Math.min(nh - y, newCrop.h));
    setImageCrop(shape.id, { x, y, w, h });
  }

  // 8 handle positions in preview-local coords.
  const handles: Array<{ id: string; x: number; y: number }> = [
    { id: "tl", x: cropLocalX, y: cropLocalY },
    { id: "tr", x: cropLocalX + cropLocalW, y: cropLocalY },
    { id: "bl", x: cropLocalX, y: cropLocalY + cropLocalH },
    { id: "br", x: cropLocalX + cropLocalW, y: cropLocalY + cropLocalH },
    { id: "tc", x: cropLocalX + cropLocalW / 2, y: cropLocalY },
    { id: "bc", x: cropLocalX + cropLocalW / 2, y: cropLocalY + cropLocalH },
    { id: "ml", x: cropLocalX, y: cropLocalY + cropLocalH / 2 },
    { id: "mr", x: cropLocalX + cropLocalW, y: cropLocalY + cropLocalH / 2 },
  ];

  function onHandleDrag(handleId: string, lx: number, ly: number) {
    const p = localToNatural(lx, ly);
    const right = crop.x + crop.w;
    const bottom = crop.y + crop.h;
    const cx = crop.x + crop.w / 2;
    const cy = crop.y + crop.h / 2;
    const r = cropAspectRatio;

    if (r == null) {
      let newCrop = { ...crop };
      switch (handleId) {
        case "tl":
          newCrop = { x: p.x, y: p.y, w: right - p.x, h: bottom - p.y };
          break;
        case "tr":
          newCrop = { x: crop.x, y: p.y, w: p.x - crop.x, h: bottom - p.y };
          break;
        case "bl":
          newCrop = { x: p.x, y: crop.y, w: right - p.x, h: p.y - crop.y };
          break;
        case "br":
          newCrop = { x: crop.x, y: crop.y, w: p.x - crop.x, h: p.y - crop.y };
          break;
        case "tc":
          newCrop = { x: crop.x, y: p.y, w: crop.w, h: bottom - p.y };
          break;
        case "bc":
          newCrop = { x: crop.x, y: crop.y, w: crop.w, h: p.y - crop.y };
          break;
        case "ml":
          newCrop = { x: p.x, y: crop.y, w: right - p.x, h: crop.h };
          break;
        case "mr":
          newCrop = { x: crop.x, y: crop.y, w: p.x - crop.x, h: crop.h };
          break;
      }
      commitFreeCrop(newCrop);
      return;
    }

    // Ratio-locked: one axis drives, the other follows. Reject the tick if
    // the resulting rect escapes natural bounds rather than de-ratio.
    let nc: { x: number; y: number; w: number; h: number } | null = null;
    switch (handleId) {
      case "tl": {
        const w = right - p.x;
        const h = w / r;
        nc = { x: p.x, y: bottom - h, w, h };
        break;
      }
      case "tr": {
        const w = p.x - crop.x;
        const h = w / r;
        nc = { x: crop.x, y: bottom - h, w, h };
        break;
      }
      case "bl": {
        const w = right - p.x;
        const h = w / r;
        nc = { x: p.x, y: crop.y, w, h };
        break;
      }
      case "br": {
        const w = p.x - crop.x;
        const h = w / r;
        nc = { x: crop.x, y: crop.y, w, h };
        break;
      }
      case "tc": {
        const h = bottom - p.y;
        const w = h * r;
        nc = { x: cx - w / 2, y: p.y, w, h };
        break;
      }
      case "bc": {
        const h = p.y - crop.y;
        const w = h * r;
        nc = { x: cx - w / 2, y: crop.y, w, h };
        break;
      }
      case "ml": {
        const w = right - p.x;
        const h = w / r;
        nc = { x: p.x, y: cy - h / 2, w, h };
        break;
      }
      case "mr": {
        const w = p.x - crop.x;
        const h = w / r;
        nc = { x: crop.x, y: cy - h / 2, w, h };
        break;
      }
    }
    if (!nc) return;
    if (nc.w < 5 || nc.h < 5) return;
    if (
      nc.x < 0 ||
      nc.y < 0 ||
      nc.x + nc.w > nw ||
      nc.y + nc.h > nh
    )
      return;
    setImageCrop(shape.id, nc);
  }

  function setCursor(e: KonvaEventObject<MouseEvent>, c: string) {
    const container = e.target.getStage()?.container();
    if (container) container.style.cursor = c;
  }

  // Dragging the crop outline pans crop.x/y (w/h preserved). Clamp into
  // image bounds and snap the Rect back so it can't drift outside.
  function onOutlineDragMove(e: KonvaEventObject<DragEvent>) {
    const t = e.target;
    const natX = (t.x() / previewW) * nw;
    const natY = (t.y() / previewH) * nh;
    const clampedX = Math.max(0, Math.min(nw - crop.w, natX));
    const clampedY = Math.max(0, Math.min(nh - crop.h, natY));
    t.x((clampedX / nw) * previewW);
    t.y((clampedY / nh) * previewH);
    setImageCrop(shape.id, { ...crop, x: clampedX, y: clampedY });
  }

  return (
    <Group
      x={previewWorldX + previewW / 2}
      y={previewWorldY + previewH / 2}
      offsetX={previewW / 2}
      offsetY={previewH / 2}
      rotation={rotation}
    >
      {/* Full-res preview of the natural image. UrlImage is suppressed for
          this shape while cropping, so the preview renders at full opacity;
          the scrim below dims everything outside the crop rect. */}
      <KImage
        x={0}
        y={0}
        width={previewW}
        height={previewH}
        image={img}
        listening={false}
      />
      {/* Dark scrim: four Rects surrounding the crop rect */}
      <Rect
        x={0}
        y={0}
        width={previewW}
        height={cropLocalY}
        fill="rgba(0,0,0,0.45)"
        listening={false}
      />
      <Rect
        x={0}
        y={cropLocalY + cropLocalH}
        width={previewW}
        height={previewH - (cropLocalY + cropLocalH)}
        fill="rgba(0,0,0,0.45)"
        listening={false}
      />
      <Rect
        x={0}
        y={cropLocalY}
        width={cropLocalX}
        height={cropLocalH}
        fill="rgba(0,0,0,0.45)"
        listening={false}
      />
      <Rect
        x={cropLocalX + cropLocalW}
        y={cropLocalY}
        width={previewW - (cropLocalX + cropLocalW)}
        height={cropLocalH}
        fill="rgba(0,0,0,0.45)"
        listening={false}
      />
      {/* Crop rect outline — drag to move; dblclick to commit. The `crop-ui`
          name lets the stage-level onMouseDown recognize clicks on the crop
          UI and skip the "commit on outside click" behavior. */}
      <Rect
        name="crop-ui"
        x={cropLocalX}
        y={cropLocalY}
        width={cropLocalW}
        height={cropLocalH}
        stroke="#ffffff"
        strokeWidth={2 / zoom}
        dash={[6 / zoom, 4 / zoom]}
        draggable
        onMouseEnter={(e) => setCursor(e, "move")}
        onMouseLeave={(e) => setCursor(e, "default")}
        onDragMove={onOutlineDragMove}
        onDragEnd={onOutlineDragMove}
        onDblClick={() => endImageCrop(true)}
        onDblTap={() => endImageCrop(true)}
      />
      {/* 8 draggable handles */}
      {handles.map((h) => (
        <Rect
          key={h.id}
          name="crop-ui"
          x={h.x - handleSize / 2}
          y={h.y - handleSize / 2}
          width={handleSize}
          height={handleSize}
          fill="#ffffff"
          stroke="#0d9488"
          strokeWidth={1 / zoom}
          draggable
          onDragMove={(e) =>
            onHandleDrag(
              h.id,
              e.target.x() + handleSize / 2,
              e.target.y() + handleSize / 2
            )
          }
          onDragEnd={(e) => {
            onHandleDrag(
              h.id,
              e.target.x() + handleSize / 2,
              e.target.y() + handleSize / 2
            );
          }}
        />
      ))}
    </Group>
  );
}

/**
 * Renders any of the unified ShapeKind variants. Picks a Konva primitive
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
          verticalAlign={text!.verticalAlign ?? "top"}
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
