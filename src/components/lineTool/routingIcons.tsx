/**
 * Shared routing-glyph SVGs + meta for the Line tool.
 *
 * Two surfaces render the same four icons and labels:
 *   • left-sidebar `LineToolButton` flyout (Toolbar.tsx)
 *   • top-center `RoutingDropdown` (lineTool/RoutingDropdown.tsx)
 *
 * Keeping both paths on a single source means a stroke-width or viewBox
 * tweak here propagates to both — no drift between the two menus.
 *
 * Each icon accepts an optional `size` (defaults to 16) and uses
 * `stroke="currentColor"` so it inherits button text colour, matching
 * the lucide icons they sit next to.
 */

import type { LineRouting } from "../../types";

export function StraightLineIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <path d="M3 13 L13 3" />
    </svg>
  );
}

export function ArcLineIcon({ size = 16 }: { size?: number }) {
  // Upward-bowing semicircle: sweep-flag=1 with y-down SVG coords puts
  // the circumcenter below the chord, tracing the minor arc through
  // the top — matches `computeArcPath`'s final sign convention.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <path d="M3 12 A 5 5 0 0 1 13 12" />
    </svg>
  );
}

export function ElbowLineIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3 L3 12 L13 12" />
    </svg>
  );
}

export function CurvedLineIcon({ size = 16 }: { size?: number }) {
  // Single cubic segment that reads as an "S" between the two endpoints.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <path d="M3 12 C 5 4, 11 12, 13 4" />
    </svg>
  );
}

/**
 * Canonical ordering + descriptive labels for the routing options.
 * The shorter single-word strings in `LINE_ROUTINGS` (types.ts) remain
 * the source for compact surfaces like the old SegmentedControl; this
 * list is what we show in the two dropdowns that have room for the
 * full phrase ("Elbow Joint" reads clearer than "Elbow" in a menu).
 */
export const LINE_ROUTING_META: {
  id: LineRouting;
  label: string;
  icon: React.ReactNode;
}[] = [
  { id: "straight", label: "Straight Line", icon: <StraightLineIcon /> },
  { id: "arc", label: "Arc", icon: <ArcLineIcon /> },
  { id: "elbow", label: "Elbow Joint", icon: <ElbowLineIcon /> },
  { id: "curved", label: "Curved Line", icon: <CurvedLineIcon /> },
];
