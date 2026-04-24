/**
 * LineToolMenu — contextual configuration strip for the Line tool.
 *
 * Anchored below the top bar of the canvas area. Visible in two cases:
 *   1. The Line tool is active — menu edits the tool *defaults* that get
 *      stamped onto the next drawn line.
 *   2. A line shape is currently selected (via canvas click or the left
 *      sidebar) — menu edits that specific shape in-place.
 *
 * Four sections: Type (routing), Style (weight + pattern), Ends (markers +
 * swap), and Color + Opacity.
 */

import { useStore } from "../store";
import {
  LINE_PATTERNS,
  LINE_ROUTINGS,
} from "../types";
import type {
  LineMarkerKind,
  LinePattern,
  LineRouting,
  LineShape,
} from "../types";
import { SegmentedControl } from "./lineTool/SegmentedControl";
import { MarkerDropdown } from "./lineTool/MarkerDropdown";
import { ColorSwatches } from "./lineTool/ColorSwatches";
import { ArrowLeftRight } from "lucide-react";

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

  const opacityPct = Math.round(opacity * 100);

  // Writers — dispatch to the selected line if we have one, else to the
  // tool-default store slots.
  const setRouting = (r: LineRouting) =>
    editing ? updateShape(editing.id, { routing: r }) : tSetRouting(r);
  const setWeight = (w: number) => {
    const clamped = Math.max(0, Math.min(10, Math.round(w * 2) / 2));
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

  return (
    <div
      role="toolbar"
      aria-label="Line tool options"
      className="absolute top-4 left-1/2 -translate-x-1/2 z-20 panel rounded-xl shadow-pop px-2.5 py-2 flex flex-wrap items-center gap-2 max-w-[calc(100%-2rem)]"
    >
      {/* ─── Type (routing) ─── */}
      <Section label="Type">
        <SegmentedControl
          options={LINE_ROUTINGS}
          value={routing}
          onChange={setRouting}
          ariaLabel="Line routing"
        />
      </Section>

      <Separator />

      {/* ─── Weight + Pattern ─── */}
      <Section label="Weight">
        <input
          type="range"
          min={0}
          max={10}
          step={0.5}
          value={weight}
          onChange={(e) => setWeight(parseFloat(e.target.value))}
          aria-label="Line weight"
          aria-valuenow={weight}
          aria-valuemin={0}
          aria-valuemax={10}
          aria-valuetext={String(weight)}
          className="line-tool-range w-20"
        />
        <span className="text-[11px] tabular-nums w-6 text-right text-ink-300">
          {weight}
        </span>
        <SegmentedControl
          options={LINE_PATTERNS}
          value={pattern}
          onChange={setPattern}
          ariaLabel="Line pattern"
        />
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

      {/* ─── Color + Opacity ─── */}
      <Section label="Color">
        <ColorSwatches value={color} onChange={setColor} />
        <span className="text-[10px] uppercase tracking-wide text-ink-300 ml-1">
          Opacity
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={opacityPct}
          onChange={(e) => setOpacity(parseInt(e.target.value, 10) / 100)}
          aria-label="Line opacity"
          aria-valuenow={opacityPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${opacityPct}%`}
          className="line-tool-range w-20"
        />
        <span className="text-[11px] tabular-nums w-9 text-right text-ink-300">
          {opacityPct}%
        </span>
      </Section>
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
