/**
 * PenToolMenu — contextual configuration strip for the Pen tool.
 *
 * Anchored below the top bar of the canvas area. Visible in two cases:
 *   1. The Pen tool is active — menu edits the tool *defaults* (per
 *      variant) that get stamped onto the next drawn stroke.
 *   2. A pen shape is currently selected (canvas click or left sidebar) —
 *      menu edits that specific shape in-place.
 *
 * Section order (left → right):
 *   Type · Color · Weight · Transparency · [Lock · Hide · More]
 *
 * The trailing [Lock · Hide · More] group targets a specific shape, so
 * it only renders in editing mode (pen shape selected). In tool-only mode
 * the bar still surfaces the drawing defaults so picking up the Pen tool
 * previews what the next stroke will look like.
 *
 * Mirrors LineToolMenu's structure 1:1 — same frame chrome, same Section/
 * Separator helpers, same TrailingButton group — so the two contextual
 * surfaces read as siblings. The "More" button delegates to the existing
 * <ContextMenu /> mounted at the App root, which already exposes
 * Duplicate / Cut / Copy / Paste / Rename / Delete on the targeted shape;
 * we just aim it at the selected pen shape from under the 3-dots button.
 */

import { useEffect, useRef, useState } from "react";
import {
  Brush,
  ChevronDown,
  Eye,
  EyeOff,
  Highlighter,
  Lock,
  MoreHorizontal,
  Pen,
  Unlock,
} from "lucide-react";
import { useStore } from "../store";
import type { PenShape, PenVariant } from "../types";
import { ColorDropdown } from "./lineTool/ColorDropdown";
import { PenColorSwatches } from "./pen/PenColors";
import { MarkerColorSwatches } from "./pen/MarkerColors";
import { HighlighterColorSwatches } from "./pen/HighlighterColors";
import { RULER_SIZE } from "./Rulers";

const PEN_VARIANTS: { id: PenVariant; label: string }[] = [
  { id: "pen", label: "Pen" },
  { id: "marker", label: "Marker" },
  { id: "highlighter", label: "Highlighter" },
];

export function PenToolMenu() {
  const tool = useStore((s) => s.tool);
  const selectedPen = useStore((s) => {
    const id = s.selectedShapeId;
    if (!id) return null;
    const sh = s.shapes.find((x) => x.id === id);
    return sh && sh.type === "pen" ? (sh as PenShape) : null;
  });

  // ─── Tool-default subscriptions (used when no pen shape is selected) ───
  const tVariant = useStore((s) => s.penVariant);
  const tSetVariant = useStore((s) => s.setPenVariant);
  const tVariants = useStore((s) => s.penVariants);
  const tSetVariantColor = useStore((s) => s.setPenVariantColor);
  const tSetVariantWeight = useStore((s) => s.setPenVariantWeight);
  const tSetVariantOpacity = useStore((s) => s.setPenVariantOpacity);

  const updateShape = useStore((s) => s.updateShape);
  const openContextMenu = useStore((s) => s.openContextMenu);

  // Variant dropdown state. Local — outside-click + Escape dismissal.
  const [variantOpen, setVariantOpen] = useState(false);
  const variantRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!variantOpen) return;
    function onDown(e: MouseEvent) {
      if (
        variantRef.current &&
        !variantRef.current.contains(e.target as Node)
      ) {
        setVariantOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setVariantOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [variantOpen]);

  // Render only when there's a surface to configure.
  if (tool !== "pen" && !selectedPen) return null;

  const editing = selectedPen;

  // Resolve the current variant — for an existing pen shape we honour its
  // own `variant` field (falling back to the tool-default if it predates the
  // multi-variant feature). For tool-only mode we follow the active variant.
  const variant: PenVariant = editing?.variant ?? tVariant;
  const variantSettings = tVariants[variant];

  // Unified read model — shape-bound when editing, tool defaults otherwise.
  const color = editing ? editing.stroke ?? variantSettings.color : variantSettings.color;
  const weight = editing
    ? editing.strokeWidth ?? variantSettings.weight
    : variantSettings.weight;
  const opacity = editing ? editing.opacity ?? variantSettings.opacity : variantSettings.opacity;

  // Writers — dispatch to the selected shape if we have one, else to the
  // tool-default store slots keyed by the active variant.
  const setVariant = (v: PenVariant) => {
    if (editing) updateShape(editing.id, { variant: v });
    else tSetVariant(v);
  };
  const setColor = (hex: string) => {
    if (editing) updateShape(editing.id, { stroke: hex });
    else tSetVariantColor(variant, hex);
  };
  const setWeight = (w: number) => {
    // Match the existing `ToolOptionsBar` pen weight range (1..100, integer).
    const clamped = Math.max(1, Math.min(100, Math.round(w)));
    if (editing) updateShape(editing.id, { strokeWidth: clamped });
    else tSetVariantWeight(variant, clamped);
  };
  const setOpacity = (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    if (editing) updateShape(editing.id, { opacity: clamped });
    else tSetVariantOpacity(variant, clamped);
  };

  // ─── Trailing-group handlers (editing-mode only) ───
  const toggleLock = () => {
    if (!editing) return;
    updateShape(editing.id, { locked: !editing.locked });
  };
  const toggleVisible = () => {
    if (!editing) return;
    updateShape(editing.id, { visible: !editing.visible });
  };
  // The existing <ContextMenu /> (mounted by App.tsx) handles Duplicate /
  // Cut / Copy / Paste / Rename / Delete — we just aim it at the selected
  // pen shape from under the 3-dots button. Same pattern as LineToolMenu.
  const openMore = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!editing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    openContextMenu({
      x: rect.left,
      y: rect.bottom + 4,
      target: "element",
      elementId: editing.id,
    });
  };

  // Variant dropdown trigger — current variant's icon + label, mirroring
  // `LineToolButton` / `PenToolButton` so the surface reads the same as
  // every other variant chooser in the editor.
  const VariantIcon =
    variant === "marker" ? Brush : variant === "highlighter" ? Highlighter : Pen;
  const variantLabel = PEN_VARIANTS.find((v) => v.id === variant)?.label ?? "Pen";

  return (
    <div
      role="toolbar"
      aria-label="Pen tool options"
      // Same frame chrome as LineToolMenu so the two surfaces read as
      // siblings: top-center, just below the horizontal ruler, no
      // overflow clipping (popovers escape the toolbar's bounds).
      className="absolute left-1/2 -translate-x-1/2 z-20 panel rounded-xl shadow-pop px-2.5 py-2 flex flex-nowrap items-center gap-2 whitespace-nowrap"
      style={{ top: RULER_SIZE + 8 }}
    >
      {/* ─── Type (variant) ─── */}
      <Section label="Type">
        <div ref={variantRef} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={variantOpen}
            aria-label="Pen variant"
            title="Pen variant"
            onClick={() => setVariantOpen((v) => !v)}
            className={
              "h-7 pl-2 pr-1.5 inline-flex items-center gap-1.5 rounded-md border text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 " +
              (variantOpen
                ? "bg-ink-700 border-ink-600 text-ink-100"
                : "bg-ink-800 border-ink-700 text-ink-200 hover:bg-ink-700 hover:text-ink-100")
            }
          >
            <VariantIcon size={13} className="text-ink-400" />
            <span>{variantLabel}</span>
            <ChevronDown
              size={11}
              className={
                "text-ink-400 transition-transform " +
                (variantOpen ? "rotate-180" : "")
              }
            />
          </button>
          {variantOpen && (
            <div
              role="menu"
              aria-label="Pen variants"
              className="absolute left-0 top-full mt-1 z-40 w-40 rounded-md border border-ink-700 bg-ink-800 text-ink-100 shadow-2xl py-1"
            >
              {PEN_VARIANTS.map((v) => {
                const selected = v.id === variant;
                const Icon =
                  v.id === "marker"
                    ? Brush
                    : v.id === "highlighter"
                    ? Highlighter
                    : Pen;
                return (
                  <button
                    key={v.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => {
                      setVariant(v.id);
                      setVariantOpen(false);
                    }}
                    className={
                      "w-full flex items-center gap-2 pl-2 pr-2.5 py-1.5 text-xs text-left transition-colors " +
                      (selected
                        ? "text-ink-100 bg-ink-700/40"
                        : "text-ink-200 hover:bg-ink-700/70")
                    }
                  >
                    <Icon size={12} className="text-ink-300 shrink-0" />
                    <span className="flex-1">{v.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Section>

      <Separator />

      {/* ─── Color (dropdown — swatches + opacity slider live inside the
          popover, identical pattern to LineToolMenu so the two surfaces
          stay visually aligned) ─── */}
      <Section label="Color">
        <ColorDropdown
          color={color}
          opacity={opacity}
          onColorChange={setColor}
          onOpacityChange={setOpacity}
          // Variant-specific curated palette appears above the full picker.
          // Each variant owns its colours in src/components/pen/*Colors.tsx —
          // see those files for the canonical defaults (Pen→Blue, Marker→
          // Red, Highlighter→Neon Yellow). Store defaults in store.ts mirror
          // each palette's first entry verbatim.
          presets={
            variant === "marker"
              ? {
                  label: "Marker colours",
                  render: ({ value, onChange }) => (
                    <MarkerColorSwatches value={value} onChange={onChange} />
                  ),
                }
              : variant === "highlighter"
              ? {
                  label: "Highlighter colours",
                  render: ({ value, onChange }) => (
                    <HighlighterColorSwatches
                      value={value}
                      onChange={onChange}
                    />
                  ),
                }
              : {
                  label: "Pen colours",
                  render: ({ value, onChange }) => (
                    <PenColorSwatches value={value} onChange={onChange} />
                  ),
                }
          }
        />
      </Section>

      <Separator />

      {/* ─── Weight ─── */}
      <Section label="Weight">
        <input
          type="range"
          min={1}
          max={100}
          step={1}
          value={weight}
          onChange={(e) => setWeight(parseFloat(e.target.value))}
          aria-label="Pen weight"
          aria-valuenow={weight}
          aria-valuemin={1}
          aria-valuemax={100}
          aria-valuetext={`${weight}px`}
          className="line-tool-range w-20"
        />
        {/* w-8 so a 3-digit value like "100" doesn't overflow the badge. */}
        <span className="text-[11px] tabular-nums w-8 text-right text-ink-300">
          {weight}
        </span>
      </Section>

      {/* ─── Lock / Hide / More (editing-mode only) ───
          Mirrors the visual family used by LineToolMenu / SelectionToolbar
          so the per-shape actions read as a clearly separated trailing
          group. The 3-dots button delegates to the global ContextMenu so
          Duplicate / Cut / Copy / Paste / Rename / Delete come for free. */}
      {editing && (
        <>
          <Separator />
          <div className="flex items-center gap-0.5">
            <TrailingButton
              title={editing.locked ? "Unlock" : "Lock"}
              ariaLabel={editing.locked ? "Unlock pen stroke" : "Lock pen stroke"}
              onClick={toggleLock}
              Icon={editing.locked ? Unlock : Lock}
            />
            <TrailingButton
              title={editing.visible ? "Hide" : "Unhide"}
              ariaLabel={
                editing.visible ? "Hide pen stroke" : "Unhide pen stroke"
              }
              onClick={toggleVisible}
              Icon={editing.visible ? Eye : EyeOff}
            />
            <TrailingButton
              title="More actions"
              ariaLabel="More actions"
              onClick={openMore}
              Icon={MoreHorizontal}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-ink-300">
        {label}
      </span>
      {children}
    </div>
  );
}

function Separator() {
  return (
    <span aria-hidden="true" className="self-stretch w-px bg-ink-700 mx-0.5" />
  );
}

/** Icon-only button styled to match SelectionToolbar / LineToolMenu's
 *  TrailingButton — keeps per-shape actions visually grouped across
 *  every contextual surface. */
function TrailingButton({
  title,
  ariaLabel,
  onClick,
  Icon,
}: {
  title: string;
  ariaLabel: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
      className="w-7 h-7 inline-flex items-center justify-center rounded text-ink-100 hover:bg-ink-700/60 transition-colors"
    >
      <Icon size={14} />
    </button>
  );
}
