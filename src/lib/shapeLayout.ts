import type { ShapeKind } from "../types";

/**
 * Splits a form-control shape's bounding box into a glyph area (where the
 * tickbox / radio / toggle / slider visuals draw) and a label area (where
 * the text sits next to the glyph). Both Canvas's `UnifiedShapeNode` and
 * `TextEditOverlay` use this so the rendered glyph + label and the edit
 * textarea agree on geometry — without it, dbl-clicking a tickbox to edit
 * its label opens a textarea at the LEFT edge of the bbox (over the glyph)
 * instead of where the user expects (over the label).
 *
 * Layout per kind:
 * - tickbox / radio / toggle: square glyph anchored TOP-LEFT (size =
 *   `glyphSize`, capped to the bbox height). Label fills everything to
 *   the right of the glyph (full bbox height — supports multi-line text
 *   when the shape grows vertically).
 * - slider: label on the LEFT (~40% of width, but never narrower than
 *   `h`), slider strip on the RIGHT (~60%).
 *
 * Pass `hasLabel = true` to force the split even when the shape currently
 * has no text — useful for the edit overlay, which needs to position the
 * textarea over where the label WILL be once the user starts typing.
 *
 * Pass `glyphSize` to decouple the visible glyph from `h`. Without this
 * the glyph scales 1:1 with bbox height — fine for a 28-tall tickbox,
 * silly for a 200-tall multi-line one. Callers should compute a sensible
 * cap (e.g. `Math.min(h, 36)`).
 */
export interface FormControlLayout {
  glyphRect: { x: number; y: number; w: number; h: number };
  /** null when the shape isn't a form control, or when the bbox is too
   *  small to support a label area (in which case the glyph fills the
   *  full bbox). */
  labelRect: { x: number; y: number; w: number; h: number } | null;
}

const GAP = 4;

export function computeFormControlLayout(
  kind: ShapeKind,
  w: number,
  h: number,
  hasLabel: boolean,
  glyphSize?: number,
): FormControlLayout {
  const isTickboxLike =
    kind === "tickbox" || kind === "radio" || kind === "toggle";
  const isSlider = kind === "slider";
  const isFormControl = isTickboxLike || isSlider;

  // Default: whole bbox is the glyph, no label rect. Used for non-form
  // controls and for form controls without a label.
  let glyphRect = { x: 0, y: 0, w, h };
  let labelRect: FormControlLayout["labelRect"] = null;

  if (!isFormControl || !hasLabel) {
    return { glyphRect, labelRect };
  }

  if (isTickboxLike) {
    // Cap the glyph to the bbox height so it never overflows a short box,
    // and respect the caller's optional cap (e.g. 36px) so multi-line
    // labels don't blow up the glyph as the box grows vertically.
    const gs = Math.min(glyphSize ?? h, h);
    // Toggle/switch uses a horizontal pill (≈1.8 : 1 ratio) — square glyph
    // would render as a circle. Tickbox & radio stay square.
    const isToggle = kind === "toggle";
    const gw = isToggle ? Math.round(gs * 1.8) : gs;
    if (w <= gw + GAP * 2) {
      // Bbox too narrow to host both glyph and label — fall back to the
      // glyph filling the box.
      return { glyphRect, labelRect };
    }
    glyphRect = { x: 0, y: 0, w: gw, h: gs };
    labelRect = {
      x: gw + GAP,
      y: 0,
      w: w - gw - GAP,
      h, // full bbox height: lets multi-line text wrap inside
    };
  } else if (isSlider && w > h * 2) {
    // Label takes the leftmost ~40%, capped so the slider strip keeps at
    // least `h * 1.5` and the label keeps at least `h`.
    const labelW = Math.max(h, Math.min(w * 0.4, w - h * 1.5));
    labelRect = { x: 0, y: 0, w: labelW - GAP, h };
    glyphRect = { x: labelW, y: 0, w: w - labelW, h };
  }

  return { glyphRect, labelRect };
}

/**
 * The natural cap for a tickbox/radio/toggle glyph. Beyond this size the
 * glyph stops scaling with the bbox height so multi-line labels don't
 * inflate the visible control. Picked to match the default tickbox draw
 * height of 28 with a little headroom.
 */
export const FORM_CONTROL_GLYPH_CAP = 36;
