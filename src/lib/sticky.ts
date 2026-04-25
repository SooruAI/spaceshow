import type { TextContent, User } from "../types";
import { DEFAULT_TEXT_FONT } from "./fonts";

/**
 * Preset palette for the sticky color picker. Order is the visual order in
 * the swatch row. The first entry (yellow) is the create-time default — keep
 * it at index 0 so `STICKY_COLOR_SWATCHES[0].value` is the canonical fallback.
 */
export const STICKY_COLOR_SWATCHES: { label: string; value: string }[] = [
  { label: "Yellow", value: "#fef3c7" },
  { label: "Blue",   value: "#dbeafe" },
  { label: "Green",  value: "#d1fae5" },
  { label: "Pink",   value: "#fce7f3" },
  { label: "Orange", value: "#fed7aa" },
  { label: "White",  value: "#ffffff" },
];

export const DEFAULT_STICKY_BG = STICKY_COLOR_SWATCHES[0].value;

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
