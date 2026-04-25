export type ViewMode = "slide" | "board";

const KEY = "spaceshow-view-mode";

/**
 * Always returns "slide". Slide is the canonical default workspace mode and
 * every page load starts there — toggling to board is allowed within a
 * session via Settings, but the choice does NOT persist across reloads.
 *
 * Also clears any stale value from earlier builds where view mode WAS
 * persisted, so users who toggled to board in a prior session get a clean
 * slide-default start instead of being stuck in board.
 */
export function getStoredViewMode(): ViewMode {
  try {
    if (localStorage.getItem(KEY) !== null) {
      localStorage.removeItem(KEY);
    }
  } catch {
    /* storage may be unavailable (privacy mode, quota, etc.) */
  }
  return "slide";
}

/**
 * No-op. Kept for callsite compatibility with the store's setViewMode
 * action. View mode is no longer persisted — see getStoredViewMode.
 */
export function setStoredViewMode(_m: ViewMode) {
  /* intentional no-op */
}
