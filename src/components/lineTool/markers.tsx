/**
 * Marker glyphs rendered as inline SVG.
 *
 * The glyph is drawn pointing right — suitable for the End marker. For the
 * Start marker we mirror the whole `<g>` with `transform="scale(-1,1)"` so
 * the arrowhead / cap points outward on that side too. One source of truth
 * keeps the dropdown preview and the future canvas renderer in sync.
 */

import type { LineMarkerKind } from "../../types";

interface MarkerProps {
  kind: LineMarkerKind;
  direction?: "start" | "end";
  color?: string;
  size?: number;
}

const VIEW_W = 40;
const VIEW_H = 16;

export function MarkerPreview({
  kind,
  direction = "end",
  color = "currentColor",
  size = 16,
}: MarkerProps) {
  const aspect = VIEW_W / VIEW_H;
  const height = size;
  const width = size * aspect;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      aria-hidden="true"
      focusable="false"
    >
      <g
        transform={
          direction === "start"
            ? `translate(${VIEW_W},0) scale(-1,1)`
            : undefined
        }
      >
        {/* Shared connector stub so glyphs read as "end of a line". */}
        {kind !== "none" && (
          <line
            x1={2}
            y1={VIEW_H / 2}
            x2={VIEW_W - 10}
            y2={VIEW_H / 2}
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        )}
        {kind === "none" && (
          <line
            x1={2}
            y1={VIEW_H / 2}
            x2={VIEW_W - 2}
            y2={VIEW_H / 2}
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        )}
        {renderGlyph(kind, color)}
      </g>
    </svg>
  );
}

function renderGlyph(kind: LineMarkerKind, color: string) {
  const tip = VIEW_W - 2;   // x-coord of the marker tip
  const mid = VIEW_H / 2;

  switch (kind) {
    case "none":
      return null;

    case "standardArrow":
      return (
        <polyline
          points={`${tip - 8},${mid - 5} ${tip},${mid} ${tip - 8},${mid + 5}`}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );

    case "solidArrow":
      return (
        <polygon
          points={`${tip - 8},${mid - 5} ${tip},${mid} ${tip - 8},${mid + 5}`}
          fill={color}
          stroke={color}
          strokeWidth={1}
          strokeLinejoin="round"
        />
      );

    case "openCircle":
      return (
        <circle
          cx={tip - 4}
          cy={mid}
          r={4}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
        />
      );

    case "solidCircle":
      return <circle cx={tip - 4} cy={mid} r={4} fill={color} />;

    case "openSquare":
      return (
        <rect
          x={tip - 8}
          y={mid - 4}
          width={8}
          height={8}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
        />
      );

    case "solidSquare":
      return (
        <rect
          x={tip - 8}
          y={mid - 4}
          width={8}
          height={8}
          fill={color}
        />
      );

    case "openDiamond":
      return (
        <polygon
          points={`${tip - 8},${mid} ${tip - 4},${mid - 5} ${tip},${mid} ${tip - 4},${mid + 5}`}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      );

    case "solidDiamond":
      return (
        <polygon
          points={`${tip - 8},${mid} ${tip - 4},${mid - 5} ${tip},${mid} ${tip - 4},${mid + 5}`}
          fill={color}
          stroke={color}
          strokeWidth={1}
          strokeLinejoin="round"
        />
      );

    case "flatBar":
      return (
        <line
          x1={tip - 1}
          y1={mid - 5}
          x2={tip - 1}
          y2={mid + 5}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
      );

    default:
      return null;
  }
}
