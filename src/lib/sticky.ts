import type { TextContent, User } from "../types";
import { DEFAULT_TEXT_FONT } from "./fonts";

/**
 * Preset palette for the sticky color picker — soft pastel "Post-it"-style
 * fills. Order in the array is the left-to-right visual order in the picker.
 *
 * Custom colours (any hex / opacity) are picked via the SV+hue+alpha sliders
 * in `StickyColorPicker`, modelled on the pen-tool colour popover. The
 * preset row stays intentionally short — these are the "one-click" defaults
 * for users who don't want to mix a custom colour.
 */
export const STICKY_COLOR_SWATCHES: { label: string; value: string }[] = [
  { label: "White",    value: "#ffffff" },
  { label: "Yellow",   value: "#fef3c7" },
  { label: "Pink",     value: "#fce7f3" },
  { label: "Blue",     value: "#dbeafe" },
  { label: "Peach",    value: "#fed7aa" },
  { label: "Green",    value: "#d1fae5" },
  { label: "Lavender", value: "#e9d5ff" },
];

/** Canonical default sticky background — soft light yellow, the second tile
 *  in the preset row. Hard-coded (not array-indexed) so reordering the
 *  palette in the future can't silently change the default. */
export const DEFAULT_STICKY_BG = "#fef3c7";

/** Default styling for a freshly-created sticky's HEADER text field — bold,
 *  slightly larger than body, top-aligned. */
export const DEFAULT_STICKY_HEADER: TextContent = {
  text: "",
  font: DEFAULT_TEXT_FONT,
  fontSize: 14,
  color: "#1c1e25",
  bold: true,
  italic: false,
  underline: false,
  align: "left",
  bullets: "none",
  indent: 0,
};

/** Default styling for a freshly-created sticky's BODY text field. */
export const DEFAULT_STICKY_BODY: TextContent = {
  text: "",
  font: DEFAULT_TEXT_FONT,
  fontSize: 12,
  color: "#1c1e25",
  bold: false,
  italic: false,
  underline: false,
  align: "left",
  bullets: "none",
  indent: 0,
};

/** Resolve an authorId to a display name. Falls back to "Unknown" for missing
 *  or unmapped ids so the footer never crashes on legacy data. */
export function authorName(
  authorId: string | undefined,
  users: User[]
): string {
  if (!authorId) return "Unknown";
  const u = users.find((x) => x.id === authorId);
  return u?.name ?? "Unknown";
}

/**
 * Format a sticky's createdAt timestamp as a short, human-readable label.
 * Tries to be relative for very recent stamps ("just now", "5m", "2h"),
 * falls back to a calendar date ("Apr 24") for older ones, and finally a
 * compact date+year for last-year stamps. Returns "—" for missing values.
 */
export function shortDate(createdAt: number | undefined, now = Date.now()): string {
  if (!createdAt || !Number.isFinite(createdAt)) return "—";
  const diff = now - createdAt;
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = new Date(createdAt);
  const today = new Date(now);
  const sameYear = d.getFullYear() === today.getFullYear();
  const month = d.toLocaleString(undefined, { month: "short" });
  const day = d.getDate();
  return sameYear ? `${month} ${day}` : `${month} ${day}, ${d.getFullYear()}`;
}
