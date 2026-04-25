import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Crop,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Lock,
  MoreHorizontal,
  Pencil,
  Ratio,
  RotateCcw,
  RotateCw,
  Scissors,
  Trash2,
  Unlock,
  Upload,
} from "lucide-react";
import { useStore } from "../store";
import type { ImageShape, LineStyle, Shape } from "../types";
import { ColorPickerPanel } from "./ColorPickerPanel";
import { RULER_SIZE } from "./Rulers";

const TOOLBAR_HEIGHT = 38;

type PopoverKey = "border" | "aspect" | "more";

// Aspect-ratio presets surfaced while cropping. `ratio === null` means
// either Freeform (no constraint) or Original (computed at click-time from
// the image's natural dimensions). The `kind` disambiguates.
type AspectPreset =
  | { kind: "original"; label: "Original" }
  | { kind: "freeform"; label: "Freeform" }
  | { kind: "fixed"; label: string; ratio: number };

const ASPECT_PRESETS: readonly AspectPreset[] = [
  { kind: "original", label: "Original" },
  { kind: "freeform", label: "Freeform" },
  { kind: "fixed", label: "1:1", ratio: 1 },
  { kind: "fixed", label: "16:9", ratio: 16 / 9 },
  { kind: "fixed", label: "9:16", ratio: 9 / 16 },
  { kind: "fixed", label: "5:4", ratio: 5 / 4 },
  { kind: "fixed", label: "4:5", ratio: 4 / 5 },
  { kind: "fixed", label: "4:3", ratio: 4 / 3 },
  { kind: "fixed", label: "3:4", ratio: 3 / 4 },
  { kind: "fixed", label: "3:2", ratio: 3 / 2 },
  { kind: "fixed", label: "2:3", ratio: 2 / 3 },
];

/** Floating property bar shown when an ImageShape is the current selection.
 *  Mirrors ShapeOptionsBar's layout and popover pattern but is scoped to the
 *  controls that make sense for raw images (border, crop, replace, size,
 *  rotation, group/ungroup). */
export function ImageOptionsBar() {
  const shape = useStore((s) => {
    const id = s.selectedShapeId;
    if (!id) return null;
    const found = s.shapes.find((x) => x.id === id) || null;
    return found && found.type === "image" ? (found as ImageShape) : null;
  });
  const updateShape = useStore((s) => s.updateShape);
  const setImageStyle = useStore((s) => s.setImageStyle);
  const beginImageCrop = useStore((s) => s.beginImageCrop);
  const endImageCrop = useStore((s) => s.endImageCrop);
  const croppingImageId = useStore((s) => s.croppingImageId);
  const cropAspectRatio = useStore((s) => s.cropAspectRatio);
  const setCropAspectRatio = useStore((s) => s.setCropAspectRatio);
  const duplicateShape = useStore((s) => s.duplicateShape);
  const copyShape = useStore((s) => s.copyShape);
  const cutShape = useStore((s) => s.cutShape);
  const pasteShape = useStore((s) => s.pasteShape);
  const deleteShape = useStore((s) => s.deleteShape);
  const startRenameShape = useStore((s) => s.startRenameShape);
  // Subscribe so Paste can disable when both clipboards are empty — without
  // this the row would never re-render to flip the disabled state.
  const hasClipboardShape = useStore((s) => Boolean(s.clipboard.shape));
  const hasClipboardMulti = useStore((s) => Boolean(s.clipboard.multi));

  const [open, setOpen] = useState<PopoverKey | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMd(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(null);
      }
    }
    window.addEventListener("mousedown", onMd);
    return () => window.removeEventListener("mousedown", onMd);
  }, []);

  if (!shape) return null;

  const style = shape.style ?? {
    borderEnabled: false,
    borderWeight: 2,
    borderColor: "#000000",
    borderStyle: "solid" as LineStyle,
  };

  const cropping = croppingImageId === shape.id;

  function patchStyle(p: Partial<typeof style>) {
    setImageStyle(shape!.id, p);
  }

  function triggerReplace() {
    window.dispatchEvent(
      new CustomEvent("spaceshow:image-replace", { detail: { id: shape!.id } })
    );
  }

  function rotateBy(delta: number) {
    const next = (((shape!.rotation ?? 0) + delta) % 360 + 360) % 360;
    updateShape(shape!.id, { rotation: next } as Partial<Shape>);
  }

  function selectAspect(p: AspectPreset) {
    if (p.kind === "freeform") {
      setCropAspectRatio(null);
      return;
    }
    if (p.kind === "original") {
      const nw = shape!.naturalWidth ?? shape!.width;
      const nh = shape!.naturalHeight ?? shape!.height;
      if (nw > 0 && nh > 0) setCropAspectRatio(nw / nh);
      return;
    }
    setCropAspectRatio(p.ratio);
  }

  // Is this preset the currently-active one? Freeform is active when the
  // ratio is null; Original when the ratio matches the image's natural
  // aspect; fixed presets match by numeric equality within epsilon.
  function isAspectActive(p: AspectPreset): boolean {
    const nw = shape!.naturalWidth ?? shape!.width;
    const nh = shape!.naturalHeight ?? shape!.height;
    const originalRatio = nw > 0 && nh > 0 ? nw / nh : null;
    if (p.kind === "freeform") return cropAspectRatio == null;
    if (p.kind === "original")
      return (
        cropAspectRatio != null &&
        originalRatio != null &&
        Math.abs(cropAspectRatio - originalRatio) < 1e-3
      );
    return cropAspectRatio != null && Math.abs(cropAspectRatio - p.ratio) < 1e-3;
  }

  return (
    <div
      ref={rootRef}
      className="absolute left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 panel rounded-full shadow-2xl"
      style={{
        top: RULER_SIZE + 8,
        height: TOOLBAR_HEIGHT,
        background: "var(--bg-secondary)",
      }}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-ink-200 whitespace-nowrap">
        <span className="text-ink-400">
          <ImageIcon size={13} />
        </span>
        <span className="font-medium">Image</span>
      </div>

      <Divider />

      {/* Border */}
      <button
        onClick={() => setOpen(open === "border" ? null : "border")}
        title="Border"
        className={`flex items-center gap-1.5 h-7 px-2 rounded-md text-xs transition-colors ${
          open === "border" ? "row-active" : "hover:bg-ink-700 text-ink-200"
        }`}
      >
        <span className="text-ink-300">Border</span>
        {style.borderEnabled && (
          <span
            className="inline-block w-3 h-3 rounded-sm ring-1 ring-ink-700"
            style={{ background: style.borderColor }}
          />
        )}
        <ChevronDown size={11} />
      </button>

      {/* Crop toggle */}
      <button
        onClick={() => {
          if (cropping) endImageCrop(true);
          else beginImageCrop(shape.id);
        }}
        title={cropping ? "Finish crop (Enter)" : "Crop"}
        className={`flex items-center gap-1.5 h-7 px-2 rounded-md text-xs transition-colors ${
          cropping ? "row-active" : "hover:bg-ink-700 text-ink-200"
        }`}
      >
        <Crop size={13} />
        <span>{cropping ? "Done" : "Crop"}</span>
      </button>

      {/* Aspect + quick rotate — surfaced only while cropping. */}
      {cropping && (
        <>
          <button
            onClick={() => setOpen(open === "aspect" ? null : "aspect")}
            title="Aspect ratio"
            className={`flex items-center gap-1.5 h-7 px-2 rounded-md text-xs transition-colors ${
              open === "aspect" ? "row-active" : "hover:bg-ink-700 text-ink-200"
            }`}
          >
            <Ratio size={13} />
            <span>{aspectLabel(cropAspectRatio, shape)}</span>
            <ChevronDown size={11} />
          </button>
          <button
            onClick={() => rotateBy(-90)}
            title="Rotate 90° left"
            className="flex items-center justify-center w-7 h-7 rounded-md text-xs transition-colors hover:bg-ink-700 text-ink-200"
          >
            <RotateCcw size={13} />
          </button>
          <button
            onClick={() => rotateBy(90)}
            title="Rotate 90° right"
            className="flex items-center justify-center w-7 h-7 rounded-md text-xs transition-colors hover:bg-ink-700 text-ink-200"
          >
            <RotateCw size={13} />
          </button>
        </>
      )}

      {/* Replace */}
      <button
        onClick={triggerReplace}
        title="Replace image"
        className="flex items-center gap-1.5 h-7 px-2 rounded-md text-xs transition-colors hover:bg-ink-700 text-ink-200"
      >
        <Upload size={13} />
      </button>

      <Divider />

      {/* Lock / Unlock — toggles `shape.locked`. Same visual pattern as the
          per-row lock icon in the layers sidebar so users recognize it. */}
      <button
        onClick={() =>
          updateShape(shape.id, { locked: !shape.locked } as Partial<Shape>)
        }
        title={shape.locked ? "Unlock" : "Lock"}
        className="flex items-center justify-center w-7 h-7 rounded-md text-xs transition-colors hover:bg-ink-700 text-ink-200"
      >
        {shape.locked ? <Unlock size={13} /> : <Lock size={13} />}
      </button>

      {/* Hide / Unhide — toggles `shape.visible`. */}
      <button
        onClick={() =>
          updateShape(shape.id, { visible: !shape.visible } as Partial<Shape>)
        }
        title={shape.visible ? "Hide" : "Unhide"}
        className="flex items-center justify-center w-7 h-7 rounded-md text-xs transition-colors hover:bg-ink-700 text-ink-200"
      >
        {shape.visible ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>

      {/* More options — opens a menu with Duplicate / Cut / Copy / Paste /
          Rename / Delete. Mirrors the right-click ContextMenu's action set
          so the user has the same operations regardless of entry point. */}
      <button
        onClick={() => setOpen(open === "more" ? null : "more")}
        title="More options"
        className={`flex items-center justify-center w-7 h-7 rounded-md text-xs transition-colors ${
          open === "more" ? "row-active" : "hover:bg-ink-700 text-ink-200"
        }`}
      >
        <MoreHorizontal size={14} />
      </button>

      {/* Popovers */}
      {open === "border" && (
        <div
          className="absolute top-full mt-2 left-0 z-30 panel rounded-md shadow-2xl p-3 w-72"
          style={{ background: "var(--bg-secondary)" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider text-ink-400">
              Border
            </span>
            <Switch
              checked={style.borderEnabled}
              onChange={(b) => patchStyle({ borderEnabled: b })}
            />
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-wider text-ink-400 w-16">
              Weight
            </span>
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={style.borderWeight}
              onChange={(e) =>
                patchStyle({ borderWeight: Number(e.target.value) })
              }
              disabled={!style.borderEnabled}
              className="flex-1 accent-brand-500 disabled:opacity-50"
            />
            <span className="text-[11px] text-ink-200 tabular-nums w-7 text-right">
              {style.borderWeight}px
            </span>
          </div>
          <div className="mb-3">
            <span className="text-[10px] uppercase tracking-wider text-ink-400 block mb-1">
              Style
            </span>
            <div className="flex gap-1">
              {(["solid", "dashed", "dotted", "double"] as LineStyle[]).map(
                (st) => (
                  <button
                    key={st}
                    disabled={!style.borderEnabled}
                    onClick={() => patchStyle({ borderStyle: st })}
                    className={`flex-1 h-7 px-1 rounded grid place-items-center text-[10px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      style.borderStyle === st
                        ? "row-active"
                        : "hover:bg-ink-700 text-ink-200"
                    }`}
                  >
                    <StyleGlyph style={st} />
                  </button>
                )
              )}
            </div>
          </div>
          <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1">
            Colour
          </div>
          <ColorPickerPanel
            value={style.borderColor}
            onChange={(c) => patchStyle({ borderColor: c })}
          />
        </div>
      )}

      {open === "aspect" && cropping && (
        <div
          className="absolute top-full mt-2 left-0 z-30 panel rounded-md shadow-2xl p-3 w-64"
          style={{ background: "var(--bg-secondary)" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-2">
            Aspect ratio
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {ASPECT_PRESETS.map((p) => {
              const active = isAspectActive(p);
              return (
                <button
                  key={p.label}
                  onClick={() => selectAspect(p)}
                  className={`h-8 px-2 rounded text-xs transition-colors ${
                    active
                      ? "row-active ring-1 ring-brand-600"
                      : "hover:bg-ink-700 text-ink-200"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {open === "more" && (
        <div
          // Anchored to the right of the bar so the menu can't push past the
          // viewport on narrow windows — the More button itself is the
          // rightmost item, so right-aligning is the natural choice.
          className="absolute top-full mt-2 right-0 z-30 panel rounded-md shadow-2xl py-1 w-44"
          style={{ background: "var(--bg-secondary)" }}
          onMouseDown={(e) => e.stopPropagation()}
          role="menu"
        >
          <MoreRow
            icon={<CopyPlus size={13} />}
            label="Duplicate"
            onClick={() => {
              duplicateShape(shape.id);
              setOpen(null);
            }}
          />
          <MoreRow
            icon={<Scissors size={13} />}
            label="Cut"
            onClick={() => {
              cutShape(shape.id);
              setOpen(null);
            }}
          />
          <MoreRow
            icon={<Copy size={13} />}
            label="Copy"
            onClick={() => {
              copyShape(shape.id);
              setOpen(null);
            }}
          />
          <MoreRow
            icon={<ClipboardPaste size={13} />}
            label="Paste"
            disabled={!hasClipboardShape && !hasClipboardMulti}
            onClick={() => {
              pasteShape();
              setOpen(null);
            }}
          />
          <MoreRow
            icon={<Pencil size={13} />}
            label="Rename"
            onClick={() => {
              // Mirror ContextMenu's rename flow: surface the layers row
              // (sidebar visible + tab + sheet/group expanded) so the
              // RenameInput's autoFocus actually targets a mounted node.
              const st = useStore.getState();
              st.setShowLeftSidebar(true);
              st.setLeftSidebarTab("layers");
              const groupKey = shape.groupId
                ? `group:${shape.groupId}`
                : null;
              useStore.setState((s) => ({
                expandedSheets: {
                  ...s.expandedSheets,
                  [shape.sheetId]: true,
                  ...(groupKey ? { [groupKey]: true } : {}),
                },
              }));
              startRenameShape(shape.id);
              setOpen(null);
            }}
          />
          <div className="my-1 h-px bg-ink-700" />
          <MoreRow
            icon={<Trash2 size={13} />}
            label="Delete"
            danger
            onClick={() => {
              deleteShape(shape.id);
              setOpen(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

function MoreRow({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${
        disabled
          ? "opacity-40 cursor-not-allowed text-ink-300"
          : danger
            ? "text-rose-300 hover:bg-rose-500/15"
            : "text-ink-100 hover:bg-ink-700"
      }`}
    >
      <span className="w-4 inline-flex items-center justify-center text-ink-300">
        {icon}
      </span>
      {label}
    </button>
  );
}

// Short label for the Aspect button — "Freeform" when unlocked, the matching
// preset label when locked to a named ratio, or a rough fraction otherwise.
function aspectLabel(
  ratio: number | null,
  shape: ImageShape
): string {
  if (ratio == null) return "Freeform";
  const nw = shape.naturalWidth ?? shape.width;
  const nh = shape.naturalHeight ?? shape.height;
  if (nw > 0 && nh > 0 && Math.abs(ratio - nw / nh) < 1e-3) return "Original";
  const match = ASPECT_PRESETS.find(
    (p) => p.kind === "fixed" && Math.abs(p.ratio - ratio) < 1e-3
  );
  if (match) return match.label;
  return ratio >= 1 ? `${ratio.toFixed(2)}:1` : `1:${(1 / ratio).toFixed(2)}`;
}

// ── Local atoms ─────────────────────────────────────────────────────────────
// Kept in this file to avoid a risky refactor of the 4k-line SheetToolbar.tsx.
// These mirror the implementations there and stay in sync visually.

function Divider() {
  return <div className="w-px h-5 bg-ink-700 mx-0.5" />;
}

function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex w-9 h-5 rounded-full transition-colors ${
        checked ? "bg-brand-600" : "bg-ink-700"
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function StyleGlyph({ style }: { style: LineStyle }) {
  const stroke = "#E5E7EB";
  const common = {
    stroke,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
  };
  return (
    <svg width={40} height={14} viewBox="0 0 40 14">
      {style === "solid" && <line x1={4} y1={7} x2={36} y2={7} {...common} />}
      {style === "dashed" && (
        <line
          x1={4}
          y1={7}
          x2={36}
          y2={7}
          {...common}
          strokeDasharray="6 3"
        />
      )}
      {style === "dotted" && (
        <line
          x1={4}
          y1={7}
          x2={36}
          y2={7}
          {...common}
          strokeDasharray="1 3"
        />
      )}
      {style === "double" && (
        <>
          <line x1={4} y1={4} x2={36} y2={4} {...common} strokeWidth={2.5} />
          <line x1={4} y1={10} x2={36} y2={10} {...common} strokeWidth={1} />
        </>
      )}
    </svg>
  );
}

