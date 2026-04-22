// Canonical unit conversions for the infinite canvas.
//
// Two coordinate systems coexist:
//   - "world" units: logical coords inside `worldGroupRef`. Shape points,
//     stroke widths, and eraser radii are persisted in this space.
//   - "screen" px: what the user sees at current zoom. `worldGroupRef` has
//     `scale(zoom)` applied, so Konva naturally maps world → screen.
//
// Convention: user-configurable sizes (eraserSize, pen/line/shape strokeWidth)
// are world units. They get scaled to the screen automatically by the group
// transform — DO NOT divide by zoom when rendering them.
//
// UI chrome (selection handles, dashed outlines, resize anchors) stays at
// constant-screen-px via `N / zoom` so affordances don't shrink with content.
// That's intentional — do not port those `/ zoom` calls to these helpers.

export const screenToWorld = (n: number, zoom: number) => n / zoom;
export const worldToScreen = (n: number, zoom: number) => n * zoom;

/** Floor for the eraser cursor visual so it stays visible at tiny zooms.
 *  Hit-test radius is NOT floored — truth stays in world units. */
export const MIN_ERASER_SCREEN_PX = 6;

/** Cap for the eraser cursor visual so it never covers the viewport at
 *  extreme high zoom + large eraser. */
export const MAX_ERASER_SCREEN_PX = 600;
