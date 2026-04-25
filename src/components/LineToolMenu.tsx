/**
 * LineToolMenu — contextual configuration strip for the Line tool.
 *
 * Anchored below the top bar of the canvas area. Visible in two cases:
 *   1. The Line tool is active — menu edits the tool *defaults* that get
 *      stamped onto the next drawn line.
 *   2. A line shape is currently selected (via canvas click or the left
 *      sidebar) — menu edits that specific shape in-place.
 *
 * Section order (left → right):
 *   Type · Pattern · Weight · Ends · Color · [Lock · Hide · More]
 *
 * The trailing [Lock · Hide · More] group targets a specific shape, so
 * it only renders in editing mode. In tool-only mode the bar still shows
 * the drawing defaults so picking up the Line tool previews what the
 * next stroke will look like.
 */

import { useStore } from "../store";
import type {
  LineMarkerKind,
  LinePattern,
  LineRouting,
  LineShape,
} from "../types";
import { RoutingDropdown } from "./lineTool/RoutingDropdown";
import { PatternDropdown } from "./lineTool/PatternDropdown";
import { MarkerDropdown } from "./lineTool/MarkerDropdown";
import { ColorDropdown } from "./lineTool/ColorDropdown";
import { RULER_SIZE } from "./Rulers";
import {
  ArrowLeftRight,
  Eye,
  EyeOff,
  Lock,
  MoreHorizontal,
  Unlock,
} from "lucide-react";

export function LineToolMenu() {
  const tool = useStore((s) => s.tool);
  const selectedLine = useStore((s) => {
    const id = s.selectedShapeId;
    if (!id) return null;
    const sh = s.shapes.find((x) => x.id === id);
    return sh && sh.type === "line" ? (sh as LineShape) : null;
  });

  // ─── Tool-default subscriptions (used when no line is selected) ───
  const tRouting = useStore((s) => s.lineRouting);
  const tSetRouting = useStore((s) => s.setLineRouting);
  const tWeight = useStore((s) => s.lineWeight);
  const tSetWeight = useStore((s) => s.setLineWeight);
  const tPattern = useStore((s) => s.linePattern);
  const tSetPattern = useStore((s) => s.setLinePattern);
  const tStartMarker = useStore((s) => s.lineStartMarker);
  const tSetStartMarker = useStore((s) => s.setLineStartMarker);
  const tEndMarker = useStore((s) => s.lineEndMarker);
  const tSetEndMarker = useStore((s) => s.setLineEndMarker);
  const tSwap = useStore((s) => s.swapLineMarkers);
  const tOpacity = useStore((s) => s.lineOpacity);
  const tSetOpacity = useStore((s) => s.setLineOpacity);
  const tColor = useStore((s) => s.toolColors.line);
  const tSetColor = useStore((s) => s.setToolColor);

  const updateShape = useStore((s) => s.updateShape);
  const openContextMenu = useStore((s) => s.openContextMenu);

  // Render only when there's a surface to configure.
  if (tool !== "line" && !selectedLine) return null;

  const editing = selectedLine;

  // Unified read model — whichever side is active.
  const routing: LineRouting = editing?.routing ?? tRouting;
  const weight = editing ? editing.strokeWidth ?? tWeight : tWeight;
  const pattern: LinePattern = editing?.pattern ?? tPattern;
  const startMarker: LineMarkerKind = editing?.startMarker ?? tStartMarker;
  const endMarker: LineMarkerKind = editing?.endMarker ?? tEndMarker;
  const opacity = editing?.opacity ?? (editing ? 1 : tOpacity);
  const color = editing ? editing.stroke ?? "#2c2a27" : tColor;

  // Writers — dispatch to the selected line if we have one, else to the
  // tool-default store slots.
  const setRouting = (r: LineRouting) =>
    editing ? updateShape(editing.id, { routing: r }) : tSetRouting(r);
  const setWeight = (w: number) => {
    // 0..100 px matches the SheetToolbar's "Stroke" slider range so the two
    // surfaces agree on the max thickness a line can have. Integer steps
    // keep the control predictable across its full range.
    const clamped = Math.max(0, Math.min(100, Math.round(w)));
    if (editing) updateShape(editing.id, { strokeWidth: clamped });
    else tSetWeight(clamped);
  };
  const setPattern = (p: LinePattern) =>
    editing ? updateShape(editing.id, { pattern: p }) : tSetPattern(p);
  const setStartMarker = (m: LineMarkerKind) =>
    editing ? updateShape(editing.id, { startMarker: m }) : tSetStartMarker(m);
  const setEndMarker = (m: LineMarkerKind) =>
    editing ? updateShape(editing.id, { endMarker: m }) : tSetEndMarker(m);
  const swap = () => {
    if (editing) {
      updateShape(editing.id, {
        startMarker: endMarker,
        endMarker: startMarker,
      });
    } else {
      tSwap();
    }
  };
  const setOpacity = (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    if (editing) updateShape(editing.id, { opacity: clamped });
    else tSetOpacity(clamped);
  };
  const setColor = (hex: string) => {
    if (editing) updateShape(editing.id, { stroke: hex });
    else tSetColor("line", hex);
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
  // Cut / Copy / Paste / Delete / Rename / etc. — we just aim it at the
  // selected line from under the 3-dots button.
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

  return (
    <div
      role="toolbar"
      aria-label="Line tool options"
      // `flex-nowrap` + `whitespace-nowrap` pin every section onto a single
      // row.
      //
      // Deliberately no `overflow-*` / `max-w-*`: every section here is a
      // dropdown trigger whose popover is an `absolute top-full` child
      // that needs to escape the toolbar's bounds vertically. CSS
      // promotes the other axis to `auto` when one is non-visible, so
      // setting `overflow-x-auto` here clips every RoutingDropdown /
      // PatternDropdown / MarkerDropdown / ColorDropdown popover at the
      // bottom edge of the bar. Let the strip size to its content and
      // render in front of the canvas; on ultra-narrow viewports it may
      // extend beyond the viewport edges, which is acceptable given
      // that centering via `left-1/2 -translate-x-1/2` is a pre-existing
      // constraint.
      //
      // Vertical position: `RULER_SIZE + 8` clears the horizontal ruler
      // with 8px of breathing room, matching every other floating
      // toolbar (SheetToolbar, TextFormatBar, StickyFormatBar,
      // ImageOptionsBar). Horizontal centering via `left-1/2
      // -translate-x-1/2` keeps it clear of the vertical ruler on the
      // left at normal viewport widths.
      className="absolute left-1/2 -translate-x-1/2 z-20 panel rounded-xl shadow-pop px-2.5 py-2 flex flex-nowrap items-center gap-2 whitespace-nowrap"
      style={{ top: RULER_SIZE + 8 }}
    >
      {/* ─── Type (routing) ─── */}
      <Section label="Type">
        <RoutingDropdown
          value={routing}
          onChange={setRouting}
          ariaLabel="Line routing"
        />
      </Section>

      <Separator />

      {/* ─── Pattern ─── */}
      <Section label="Pattern">
        <PatternDropdown
          value={pattern}
          onChange={setPattern}
          ariaLabel="Line pattern"
        />
      </Section>

      <Separator />

      {/* ─── Weight ─── */}
      <Section label="Weight">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={weight}
          onChange={(e) => setWeight(parseFloat(e.target.value))}
          aria-label="Line weight"
          aria-valuenow={weight}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${weight}px`}
          className="line-tool-range w-20"
        />
        {/* w-8 so a 3-digit value like "100" doesn't overflow the badge. */}
        <span className="text-[11px] tabular-nums w-8 text-right text-ink-300">
          {weight}
        </span>
      </Section>

      <Separator />

      {/* ─── Start / End markers ─── */}
      <Section label="Ends">
        <div className="flex items-center gap-1">
          <MarkerDropdown
            value={startMarker}
            onChange={setStartMarker}
            direction="start"
            ariaLabel="Start marker"
          />
          <button
            type="button"
            onClick={swap}
            aria-label="Swap start and end markers"
            title="Swap ends"
            className="w-6 h-6 grid place-items-center rounded hover:bg-ink-700 text-ink-300 hover:text-ink-100 transition-colors"
          >
            <ArrowLeftRight size={12} />
          </button>
          <MarkerDropdown
            value={endMarker}
            onChange={setEndMarker}
            direction="end"
            ariaLabel="End marker"
          />
        </div>
      </Section>

      <Separator />

      {/* ─── Color (dropdown — swatches + opacity live inside the popover,
          mirroring the Pen / Shape tool pattern in SheetToolbar.tsx) ─── */}
      <Section label="Color">
        <ColorDropdown
          color={color}
          opacity={opacity}
          onColorChange={setColor}
          onOpacityChange={setOpacity}
        />
      </Section>

      {/* ─── Lock / Hide / More (editing-mode only) ───
          Mirrors the visual family used by SelectionToolbar so the
          per-shape actions read as a clearly separated trailing group. */}
      {editing && (
        <>
          <Separator />
          <div className="flex items-center gap-0.5">
            <TrailingButton
              title={editing.locked ? "Unlock" : "Lock"}
              ariaLabel={editing.locked ? "Unlock line" : "Lock line"}
              onClick={toggleLock}
              Icon={editing.locked ? Unlock : Lock}
            />
            <TrailingButton
              title={editing.visible ? "Hide" : "Unhide"}
              ariaLabel={editing.visible ? "Hide line" : "Unhide line"}
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
    <span
      aria-hidden="true"
      className="self-stretch w-px bg-ink-700 mx-0.5"
    />
  );
}

/** Icon-only button styled to match SelectionToolbar's ToolbarButton —
 *  keeps the per-shape actions visually grouped across the two surfaces. */
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
