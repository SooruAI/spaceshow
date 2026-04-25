import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Brush,
  CheckSquare,
  Circle,
  CircleDot,
  Cloud,
  Crosshair,
  Diamond,
  Eraser,
  FilePlus,
  Heart,
  Hexagon,
  Highlighter,
  MousePointer2,
  Pen,
  Shapes,
  SlidersHorizontal,
  Square,
  Star,
  StickyNote,
  ToggleRight,
  Triangle,
  Type,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import type {
  Tool,
  PenVariant,
  EraserVariant,
  ShapeKind,
  LineRouting,
} from "../types";
import { LINE_ROUTING_META } from "./lineTool/routingIcons";

const TOOLS: { id: Tool; label: string; icon: React.ReactNode }[] = [
  { id: "select", label: "Select (V)", icon: <MousePointer2 size={16} /> },
  // Pen is rendered separately via <PenToolButton /> to host the variant flyout.
  // Eraser is rendered separately via <EraserToolButton /> for the same reason.
  // Line is rendered separately via <LineToolButton /> to host the routing flyout.
  { id: "sticky", label: "Sticky note (S)", icon: <StickyNote size={16} /> },
  { id: "text", label: "Text (T)", icon: <Type size={16} /> },
  // Comment tool button removed — comment creation now lives exclusively in
  // the right-click / two-finger-tap context menu ("Add a Comment"). The
  // Tool type still has a "comment" variant and the keyboard shortcut + pin
  // drop flow in Canvas continue to work; this just drops the toolbar entry
  // so the surface isn't duplicated.
  { id: "upload", label: "Upload file (U)", icon: <Upload size={16} /> },
];

const ERASER_VARIANTS: {
  id: EraserVariant;
  label: string;
  icon: React.ReactNode;
}[] = [
  { id: "stroke", label: "Eraser", icon: <Eraser size={16} /> },
  { id: "object", label: "Object Eraser", icon: <Crosshair size={16} /> },
];

const PEN_VARIANTS: {
  id: PenVariant;
  label: string;
  icon: React.ReactNode;
}[] = [
  { id: "pen", label: "Pen", icon: <Pen size={16} /> },
  { id: "marker", label: "Marker", icon: <Brush size={16} /> },
  { id: "highlighter", label: "Highlighter", icon: <Highlighter size={16} /> },
];

// Order matters — the picker is a 4×4 grid and we want the layout (read
// left-to-right, top-to-bottom) to read as: basic geometry → decorative
// shapes → directional arrows → form controls. Keeps related kinds visually
// adjacent so users build muscle memory.
const SHAPE_KINDS: {
  id: ShapeKind;
  label: string;
  icon: React.ReactNode;
}[] = [
  // Row 1 — basic geometry
  { id: "rectangle", label: "Rectangle (Shift = Square)", icon: <Square size={16} /> },
  { id: "ellipse", label: "Ellipse (Shift = Circle)", icon: <Circle size={16} /> },
  { id: "triangle", label: "Triangle", icon: <Triangle size={16} /> },
  { id: "polygon", label: "Polygon", icon: <Hexagon size={16} /> },
  // Row 2 — decorative shapes
  { id: "diamond", label: "Diamond", icon: <Diamond size={16} /> },
  { id: "star", label: "Star", icon: <Star size={16} /> },
  { id: "heart", label: "Heart", icon: <Heart size={16} /> },
  { id: "cloud", label: "Cloud", icon: <Cloud size={16} /> },
  // Row 3 — arrows (L, R, Up, Down — matches D-pad / arrow-key layout in a row)
  { id: "arrow-left", label: "Arrow Left", icon: <ArrowLeft size={16} /> },
  { id: "arrow-right", label: "Arrow Right", icon: <ArrowRight size={16} /> },
  { id: "arrow-up", label: "Arrow Up", icon: <ArrowUp size={16} /> },
  { id: "arrow-down", label: "Arrow Down", icon: <ArrowDown size={16} /> },
  // Row 4 — form controls
  { id: "tickbox", label: "Tickbox", icon: <CheckSquare size={16} /> },
  { id: "radio", label: "Radio Button", icon: <CircleDot size={16} /> },
  { id: "toggle", label: "Toggle / Switch", icon: <ToggleRight size={16} /> },
  { id: "slider", label: "Slider", icon: <SlidersHorizontal size={16} /> },
];

export function Toolbar({ onUploadClick }: { onUploadClick: () => void }) {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const addSheet = useStore((s) => s.addSheet);

  return (
    <div className="absolute left-9 top-1/2 -translate-y-1/2 z-20 panel rounded-xl py-2 px-1 flex flex-col gap-1 shadow-2xl">
      <button
        title="Add sheet"
        className="toolbar-btn text-brand-500"
        onClick={addSheet}
      >
        <FilePlus size={16} />
      </button>
      <div className="my-1 mx-1 h-px bg-ink-700" />
      <button
        title="Select (V)"
        className={`toolbar-btn ${tool === "select" ? "toolbar-btn-active" : ""}`}
        onClick={() => setTool("select")}
      >
        <MousePointer2 size={16} />
      </button>
      <PenToolButton />
      <EraserToolButton />
      <ShapesToolButton />
      <LineToolButton />
      {TOOLS.filter((t) => t.id !== "select").map((t) => (
        <button
          key={t.id}
          title={t.label}
          className={`toolbar-btn ${tool === t.id ? "toolbar-btn-active" : ""}`}
          onClick={() => {
            setTool(t.id);
            if (t.id === "upload") onUploadClick();
          }}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
}

function PenToolButton() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const penVariant = useStore((s) => s.penVariant);
  const penVariants = useStore((s) => s.penVariants);
  const setPenVariant = useStore((s) => s.setPenVariant);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const isActive = tool === "pen";
  const activeMeta = PEN_VARIANTS.find((v) => v.id === penVariant) ?? PEN_VARIANTS[0];

  function clearTimers() {
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleOpen() {
    clearTimers();
    hoverTimer.current = window.setTimeout(() => setOpen(true), 80);
  }

  function scheduleClose() {
    clearTimers();
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  }

  // Close the flyout if the user switches to any non-pen tool.
  useEffect(() => {
    // Auto-close the flyout when the user picks any non-matching tool. setOpen
    // is also driven by user actions (button click, outside-click), so we
    // can't trivially derive `open` from `isActive`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isActive) setOpen(false);
  }, [isActive]);

  // Outside-click + Escape.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => () => clearTimers(), []);

  function handleButtonClick() {
    clearTimers();
    if (!isActive) {
      setTool("pen");
      setOpen(true);
      return;
    }
    setOpen((o) => !o);
  }

  function pickVariant(v: PenVariant) {
    setTool("pen");
    setPenVariant(v);
    clearTimers();
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
    >
      <button
        title={`Pen (P) — ${activeMeta.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`toolbar-btn ${isActive ? "toolbar-btn-active" : ""}`}
        onClick={handleButtonClick}
      >
        {activeMeta.icon}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Pen variants"
          className="absolute top-0 left-full ml-2 z-30 panel rounded-xl py-2 px-1.5 shadow-2xl flex flex-col gap-0.5 min-w-[170px]"
          onMouseEnter={clearTimers}
          onMouseLeave={scheduleClose}
        >
          {PEN_VARIANTS.map((v) => {
            const settings = penVariants[v.id];
            const isCurrent = isActive && penVariant === v.id;
            return (
              <button
                key={v.id}
                role="menuitem"
                aria-current={isCurrent}
                className={`flex items-center gap-2.5 h-8 px-2 rounded-md text-xs transition-colors text-left ${
                  isCurrent
                    ? "row-active text-ink-100"
                    : "hover:bg-ink-700 text-ink-200"
                }`}
                onClick={() => pickVariant(v.id)}
              >
                <span className="text-ink-300">{v.icon}</span>
                <span className="flex-1">{v.label}</span>
                <span
                  className="inline-block w-3.5 h-3.5 rounded-full ring-1 ring-ink-700"
                  style={{
                    background: settings.color,
                    opacity: settings.opacity,
                  }}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ShapesToolButton() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const shapeKind = useStore((s) => s.shapeKind);
  const setShapeKind = useStore((s) => s.setShapeKind);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const isActive = tool === "shape";
  const activeMeta =
    SHAPE_KINDS.find((k) => k.id === shapeKind) ?? SHAPE_KINDS[0];

  function clearTimers() {
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleOpen() {
    clearTimers();
    hoverTimer.current = window.setTimeout(() => setOpen(true), 80);
  }

  function scheduleClose() {
    clearTimers();
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  }

  useEffect(() => {
    // Auto-close the flyout when the user picks any non-matching tool. setOpen
    // is also driven by user actions (button click, outside-click), so we
    // can't trivially derive `open` from `isActive`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isActive) setOpen(false);
  }, [isActive]);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => () => clearTimers(), []);

  function handleButtonClick() {
    clearTimers();
    if (!isActive) {
      setTool("shape");
      setOpen(true);
      return;
    }
    setOpen((o) => !o);
  }

  function pickKind(k: ShapeKind) {
    setTool("shape");
    setShapeKind(k);
    clearTimers();
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
    >
      <button
        title={`Shapes — ${activeMeta.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`toolbar-btn ${isActive ? "toolbar-btn-active" : ""}`}
        onClick={handleButtonClick}
      >
        <Shapes size={16} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Shape kinds"
          className="absolute top-0 left-full ml-2 z-30 panel rounded-xl py-2 px-2 shadow-2xl grid grid-cols-4 gap-1 w-[208px]"
          onMouseEnter={clearTimers}
          onMouseLeave={scheduleClose}
        >
          {SHAPE_KINDS.map((k) => {
            const isCurrent = isActive && shapeKind === k.id;
            return (
              <button
                key={k.id}
                role="menuitem"
                aria-current={isCurrent}
                title={k.label}
                className={`flex items-center justify-center h-9 rounded-md transition-colors ${
                  isCurrent
                    ? "row-active text-ink-100"
                    : "hover:bg-ink-700 text-ink-200"
                }`}
                onClick={() => pickKind(k.id)}
              >
                {k.icon}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EraserToolButton() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const eraserVariant = useStore((s) => s.eraserVariant);
  const setEraserVariant = useStore((s) => s.setEraserVariant);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const isActive = tool === "eraser";
  const activeMeta =
    ERASER_VARIANTS.find((v) => v.id === eraserVariant) ?? ERASER_VARIANTS[0];

  function clearTimers() {
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleOpen() {
    clearTimers();
    hoverTimer.current = window.setTimeout(() => setOpen(true), 80);
  }

  function scheduleClose() {
    clearTimers();
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  }

  useEffect(() => {
    // Auto-close the flyout when the user picks any non-matching tool. setOpen
    // is also driven by user actions (button click, outside-click), so we
    // can't trivially derive `open` from `isActive`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isActive) setOpen(false);
  }, [isActive]);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => () => clearTimers(), []);

  function handleButtonClick() {
    clearTimers();
    if (!isActive) {
      setTool("eraser");
      setOpen(true);
      return;
    }
    setOpen((o) => !o);
  }

  function pickVariant(v: EraserVariant) {
    setTool("eraser");
    setEraserVariant(v);
    clearTimers();
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
    >
      <button
        title={`Eraser (E) — ${activeMeta.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`toolbar-btn ${isActive ? "toolbar-btn-active" : ""}`}
        onClick={handleButtonClick}
      >
        {activeMeta.icon}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Eraser variants"
          className="absolute top-0 left-full ml-2 z-30 panel rounded-xl py-2 px-1.5 shadow-2xl flex flex-col gap-0.5 min-w-[180px]"
          onMouseEnter={clearTimers}
          onMouseLeave={scheduleClose}
        >
          {ERASER_VARIANTS.map((v) => {
            const isCurrent = isActive && eraserVariant === v.id;
            return (
              <button
                key={v.id}
                role="menuitem"
                aria-current={isCurrent}
                className={`flex items-center gap-2.5 h-8 px-2 rounded-md text-xs transition-colors text-left ${
                  isCurrent
                    ? "row-active text-ink-100"
                    : "hover:bg-ink-700 text-ink-200"
                }`}
                onClick={() => pickVariant(v.id)}
              >
                <span className="text-ink-300">{v.icon}</span>
                <span className="flex-1">{v.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Line tool button + routing flyout.
 *
 * Behaviour mirrors `PenToolButton` / `ShapesToolButton`:
 *   • 80 ms hover-to-open, 120 ms mouse-out-to-close debounce;
 *   • click toggles the flyout (and activates the Line tool first
 *     if it isn't already active);
 *   • outside-click and Escape dismiss;
 *   • auto-closes when the user switches to any non-line tool.
 *
 * The main button shows the CURRENT routing's icon (not a static
 * `Minus` bar), so the toolbar visibly echoes what you'll draw —
 * matching the way `PenToolButton` reflects the active pen variant.
 *
 * Icons and descriptive labels come from the shared `LINE_ROUTING_META`
 * module (`lineTool/routingIcons.tsx`), which the top-center
 * `RoutingDropdown` also reads from — one source keeps the two
 * surfaces visually identical.
 */
function LineToolButton() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const lineRouting = useStore((s) => s.lineRouting);
  const setLineRouting = useStore((s) => s.setLineRouting);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const isActive = tool === "line";
  const activeMeta =
    LINE_ROUTING_META.find((r) => r.id === lineRouting) ?? LINE_ROUTING_META[0];

  function clearTimers() {
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleOpen() {
    clearTimers();
    hoverTimer.current = window.setTimeout(() => setOpen(true), 80);
  }

  function scheduleClose() {
    clearTimers();
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  }

  // Auto-close when the user picks any non-line tool. setOpen is also
  // driven by user actions (button click, outside-click), so we can't
  // trivially derive `open` from `isActive`.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isActive) setOpen(false);
  }, [isActive]);

  // Outside-click + Escape dismissal.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => () => clearTimers(), []);

  function handleButtonClick() {
    clearTimers();
    if (!isActive) {
      setTool("line");
      setOpen(true);
      return;
    }
    setOpen((o) => !o);
  }

  function pickRouting(r: LineRouting) {
    setTool("line");
    setLineRouting(r);
    clearTimers();
    // Brief delay before auto-close so the active-state highlight is
    // visible to the user before the flyout disappears.
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
    >
      <button
        title={`Line (L) — ${activeMeta.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`toolbar-btn ${isActive ? "toolbar-btn-active" : ""}`}
        onClick={handleButtonClick}
      >
        {activeMeta.icon}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Line routings"
          className="absolute top-0 left-full ml-2 z-30 panel rounded-xl py-2 px-1.5 shadow-2xl flex flex-col gap-0.5 min-w-[150px]"
          onMouseEnter={clearTimers}
          onMouseLeave={scheduleClose}
        >
          {LINE_ROUTING_META.map((r) => {
            const isCurrent = isActive && lineRouting === r.id;
            return (
              <button
                key={r.id}
                role="menuitem"
                aria-current={isCurrent}
                className={`flex items-center gap-2.5 h-8 px-2 rounded-md text-xs transition-colors text-left ${
                  isCurrent
                    ? "row-active text-ink-100"
                    : "hover:bg-ink-700 text-ink-200"
                }`}
                onClick={() => pickRouting(r.id)}
              >
                <span className="text-ink-300">{r.icon}</span>
                <span className="flex-1">{r.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
