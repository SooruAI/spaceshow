import { Line } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Guide } from "../types";
import type { SnapKind } from "../lib/snap";

// ─────────────────────────────────────────────────────────────────────────────
// GuideLayer — renders every committed guide (plus an optional transient
// "draft" guide shown during ruler-drag creation) as Konva lines inside the
// world-transform group. strokeWidth / hitStrokeWidth / dash are scaled by
// `/zoom` so they stay visually constant at every zoom level, mirroring the
// GridLayer pattern.
//
// The drag interaction itself (mousemove/mouseup, snap integration, delete-
// by-drag-back-to-ruler) lives in Canvas.tsx because it needs direct access
// to stageRef, pan, and zoom. This component is just a dumb renderer that
// forwards mousedown to the parent.
// ─────────────────────────────────────────────────────────────────────────────

export interface GuideLayerProps {
  guides: Guide[];
  /** Transient guide shown while the user is pulling one out of a ruler.
   *  Rendered dashed; not yet in the store. */
  draft: { axis: "h" | "v"; value: number } | null;
  /** World-space viewport bounds used to clip each guide line to a finite
   *  segment. Konva can't render Infinity-long lines efficiently. */
  viewportWorldBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  zoom: number;
  selectedGuideId: string | null;
  /** Set to id when the user is actively repositioning this guide so we can
   *  render it at reduced opacity while the cursor is over the ruler strip
   *  (signalling that release will delete the guide). Null otherwise. */
  deleteHoverId: string | null;
  /** Transient snap-feedback state from the active drag. When non-null the
   *  dragging guide paints red and a short perpendicular tick renders at
   *  the snap position — makes "snap engaged" unambiguous visually. */
  snapIndicator: { axis: "h" | "v"; value: number; kind: SnapKind } | null;
  /** Id of the guide being actively repositioned. Paired with `snapIndicator`
   *  to paint that specific guide red while snap is engaged. */
  activeRepositionId: string | null;
  onGuideMouseDown: (id: string, e: KonvaEventObject<MouseEvent>) => void;
}

const ACCENT = "#0d9488";
const ACCENT_HOVER = "#14b8a6"; // slightly brighter teal for selected
const SNAP_RED = "#ef4444";     // matches the app-wide danger accent family

export function GuideLayer({
  guides,
  draft,
  viewportWorldBounds: vb,
  zoom,
  selectedGuideId,
  deleteHoverId,
  snapIndicator,
  activeRepositionId,
  onGuideMouseDown,
}: GuideLayerProps) {
  const sw = 1 / zoom;
  const swSelected = 2 / zoom;
  const hitSw = 10 / zoom;

  const renderLine = (
    key: string,
    axis: "h" | "v",
    value: number,
    opts: {
      selected?: boolean;
      draft?: boolean;
      dimmed?: boolean;
      snapping?: boolean;
      listening?: boolean;
      onMouseDown?: (e: KonvaEventObject<MouseEvent>) => void;
    }
  ) => {
    const points =
      axis === "h"
        ? [vb.minX, value, vb.maxX, value]
        : [value, vb.minY, value, vb.maxY];
    // Red wins over selected-teal so the snap signal is unambiguous while
    // dragging the currently-selected guide.
    const stroke = opts.snapping
      ? SNAP_RED
      : opts.selected
        ? ACCENT_HOVER
        : ACCENT;
    return (
      <Line
        key={key}
        points={points}
        stroke={stroke}
        strokeWidth={opts.selected || opts.snapping ? swSelected : sw}
        hitStrokeWidth={hitSw}
        dash={opts.draft ? [4 / zoom, 4 / zoom] : undefined}
        opacity={opts.dimmed ? 0.3 : 1}
        listening={opts.listening ?? true}
        onMouseDown={opts.onMouseDown}
        onMouseEnter={() => {
          // Cursor hint on hover — unified to "move" (four-way arrow) across
          // both axes, matching the active-drag cursor.
          if (opts.listening === false) return;
          document.body.style.cursor = "move";
        }}
        onMouseLeave={() => {
          document.body.style.cursor = "";
        }}
      />
    );
  };

  // Perpendicular snap tick — short red segment centered in the viewport at
  // the snap target. Complements the red-line signal with a punchier flash
  // so the snap moment is impossible to miss, Figma-style.
  const tickHalfWorld = 20 / zoom;
  const tickPoints =
    snapIndicator && snapIndicator.axis === "h"
      ? [
          (vb.minX + vb.maxX) / 2,
          snapIndicator.value - tickHalfWorld,
          (vb.minX + vb.maxX) / 2,
          snapIndicator.value + tickHalfWorld,
        ]
      : snapIndicator
        ? [
            snapIndicator.value - tickHalfWorld,
            (vb.minY + vb.maxY) / 2,
            snapIndicator.value + tickHalfWorld,
            (vb.minY + vb.maxY) / 2,
          ]
        : null;

  return (
    <>
      {guides.map((g) =>
        renderLine(g.id, g.axis, g.value, {
          selected: g.id === selectedGuideId,
          dimmed: g.id === deleteHoverId,
          snapping: !!snapIndicator && activeRepositionId === g.id,
          listening: true,
          onMouseDown: (e) => onGuideMouseDown(g.id, e),
        })
      )}
      {draft &&
        renderLine("__draft__", draft.axis, draft.value, {
          draft: true,
          snapping: !!snapIndicator,
          listening: false,
        })}
      {tickPoints && (
        <Line
          points={tickPoints}
          stroke={SNAP_RED}
          strokeWidth={2 / zoom}
          listening={false}
        />
      )}
    </>
  );
}
