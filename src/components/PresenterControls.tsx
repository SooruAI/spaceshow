import { ChevronLeft, ChevronRight, Pen, Flashlight, MousePointer2, Eraser, Trash2 } from "lucide-react";
import { useStore } from "../store";
import type { Sheet } from "../types";
import { formatSheetSize } from "../lib/sheetFormat";

interface Props {
  total: number;
  index: number;
  sheet: Sheet | null;
  onPrev: () => void;
  onNext: () => void;
  onQuit: () => void;
  /** Wipe pen strokes on the CURRENT slide only. Provided by PresenterView
   *  which owns the per-sheet stroke map — the control bar doesn't know
   *  about stroke storage, it just fires this on click. */
  onClearAll: () => void;
}

/**
 * Vertical budget the bottom control bar reserves from the slide area,
 * in CSS pixels.
 *
 * The bar is now a solid, docked chrome surface that sits on top of the
 * slide rather than hovering above it — so PresenterView has to subtract
 * this from the slide's available area and padding-bottom its flex
 * container by the same amount. The constant lives here (rather than in
 * PresenterView) because the bar is what defines its own height; breaking
 * that invariant means updating one file, not two.
 *
 * The bar itself measures 57px (py-3 × 2 + h-8 content + 1px border-top);
 * the reserve is 60 so there's a ~3px breathing band between the slide's
 * bottom edge and the bar's top border. That band absorbs sub-pixel
 * rounding and any future chrome additions (extra divider, taller button)
 * without silently clipping slide content.
 */
export const PRESENTER_BAR_HEIGHT = 60;

/**
 * Bottom docked control bar during the presenter view. Spans the full viewport
 * width and sits flush against the bottom edge so it reads as a persistent
 * chrome surface (not a floating pill). Solid `bg-ink-900` — no backdrop-blur,
 * no base-layer opacity — so the controls stay legible against slides of any
 * color. Click events on this element are stopped so they never reach the
 * zone-click navigator behind the stage.
 *
 * Layout (left → right, centered cluster):
 *   prev | counter | next | divider | sheet name + size | divider | tools | divider | quit
 */
export function PresenterControls({ total, index, sheet, onPrev, onNext, onQuit, onClearAll }: Props) {
  const tool = useStore((s) => s.presentationTool);
  const setTool = useStore((s) => s.setPresentationTool);
  const penColor = useStore((s) => s.presentationPenColor);

  const compact = typeof window !== "undefined" && window.innerWidth < 640;

  const sizeLabel = sheet ? formatSheetSize(sheet) : "";

  return (
    <div
      role="toolbar"
      aria-label="Presenter controls"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className="fixed bottom-0 left-0 right-0 flex items-center justify-center gap-3 px-5 py-3 bg-ink-900 border-t border-ink-700 z-[20] text-ink-100"
      style={{ cursor: "auto" }}
    >
      <IconButton
        onClick={onPrev}
        disabled={index <= 0}
        ariaLabel="Previous slide"
      >
        <ChevronLeft size={18} />
      </IconButton>
      <span className="text-ink-200 text-sm tabular-nums select-none min-w-[60px] text-center">
        {index + 1} of {total}
      </span>
      <IconButton onClick={onNext} ariaLabel="Next slide">
        <ChevronRight size={18} />
      </IconButton>

      {!compact && (
        <>
          <Divider />
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-ink-100 text-sm truncate max-w-[220px]">
              {sheet?.name ?? ""}
            </span>
            {sizeLabel && (
              <span className="text-ink-400 text-xs truncate">{sizeLabel}</span>
            )}
          </div>
        </>
      )}

      <Divider />
      <div className="flex items-center gap-1">
        <ToolButton
          active={tool === "cursor"}
          onClick={() => setTool("cursor")}
          ariaLabel="Cursor tool (C)"
          title="Cursor — C"
        >
          <MousePointer2 size={16} />
        </ToolButton>
        <ToolButton
          active={tool === "pen"}
          onClick={() => setTool(tool === "pen" ? "cursor" : "pen")}
          ariaLabel="Pen tool (P)"
          title="Pen — P"
        >
          <Pen size={16} />
          {/* Current-color indicator. Only renders when pen is active so the
              button stays visually calm otherwise. 2px dark border isolates
              the dot against the bar background. */}
          {tool === "pen" && (
            <span
              aria-hidden
              className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full border-2 border-ink-900"
              style={{ background: penColor }}
            />
          )}
        </ToolButton>
        <ToolButton
          active={tool === "eraser"}
          onClick={() => setTool(tool === "eraser" ? "cursor" : "eraser")}
          ariaLabel="Eraser tool (E)"
          title="Eraser — E"
        >
          <Eraser size={16} />
        </ToolButton>
        {/* One-shot "clear all annotations" action. Styled as a plain icon
            button (not a ToolButton) so it reads as an action, not a mode.
            Hover tints red to signal that it's destructive — all pen strokes
            on the current slide are wiped immediately. */}
        <ClearAllButton onClick={onClearAll} />
        <ToolButton
          active={tool === "torch"}
          onClick={() => setTool(tool === "torch" ? "cursor" : "torch")}
          ariaLabel="Torch tool (T)"
          title="Torch — T"
        >
          <Flashlight size={16} />
        </ToolButton>
      </div>

      {!compact && <Divider />}

      <button
        type="button"
        onClick={onQuit}
        className="text-ink-300 hover:text-ink-100 hover:bg-ink-800 rounded-md px-3 py-1 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 transition-colors"
        aria-label="Quit presentation (Esc)"
        title="Quit — Esc"
      >
        Quit
      </button>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  disabled,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="w-8 h-8 rounded-md flex items-center justify-center text-ink-200 hover:text-ink-100 hover:bg-ink-800 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 transition-colors"
    >
      {children}
    </button>
  );
}

function ToolButton({
  active,
  onClick,
  children,
  ariaLabel,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  ariaLabel: string;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      title={title}
      className={
        "relative w-8 h-8 rounded-md flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 " +
        (active
          ? "bg-brand-600 text-white shadow-sm"
          : "text-ink-300 hover:text-ink-100 hover:bg-ink-800")
      }
    >
      {children}
    </button>
  );
}

/**
 * Destructive "clear annotations" action. Lives inside the tools cluster
 * next to the Eraser as the user expects ("there's a thing that clears,
 * it should be right there"), but is visually distinct from the toggleable
 * ToolButtons: no active state, and a red hover tint so an accidental
 * mouse-near doesn't read the same as switching tools.
 */
function ClearAllButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Clear all annotations"
      title="Clear all annotations"
      className="relative w-8 h-8 rounded-md flex items-center justify-center text-ink-300 hover:text-red-300 hover:bg-red-500/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
    >
      <Trash2 size={16} />
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-ink-700 mx-1" aria-hidden />;
}

