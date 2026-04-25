// ─────────────────────────────────────────────────────────────────────────────
// tiptapExtensions.ts — pre-configured Tiptap extension bundle for the rich-
// text edit overlay. Centralises:
//
//   • TextStyle + bundled Color/FontFamily/FontSize from the official
//     @tiptap/extension-text-style package (v3.22 ships these together as
//     named exports — no separate FontSize extension needed).
//   • TextAlign configured to apply to "heading" + "paragraph" only — adding
//     "bulletList"/"orderedList" silently breaks alignment inside list items
//     because alignment lives on the inner paragraph, not the list node.
//   • Underline + Highlight + StarterKit (history kept ON; Cmd+Z while
//     editing intercepted by Tiptap thanks to the `isEditableTarget` guard
//     in useShortcuts.ts).
//   • A single bundle exported as `buildTextEditExtensions()` so the editor
//     overlay reads cleanly.
// ─────────────────────────────────────────────────────────────────────────────

import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import {
  TextStyle,
  Color,
  FontFamily,
  FontSize,
} from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";

/** All extensions configured for SpaceShow's rich-text edit overlay.
 *
 *  Notes:
 *  - StarterKit keeps history ON. Cmd+Z while editing → Tiptap undoes one
 *    keystroke (intercepted by isEditableTarget in useShortcuts.ts). After
 *    exit, store-level coalesce captures the entire edit session as ONE
 *    global undo step.
 *  - TextAlign types are deliberately ['heading', 'paragraph']. Don't add
 *    'bulletList'/'orderedList' — alignment on a list-item paragraph already
 *    works because the alignment attribute lives on the inner paragraph.
 *  - FontSize commands take CSS strings like "16px"; the toolbar formats
 *    numeric input accordingly.
 */
export function buildTextEditExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Underline,
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({
      types: ["heading", "paragraph"],
      defaultAlignment: "left",
    }),
  ];
}

/** Helper: convert a numeric px size to the Tiptap FontSize command's
 *  expected CSS string form. */
export function fontSizeCss(px: number): string {
  return `${px}px`;
}

/** Helper: parse the Tiptap FontSize attribute (CSS string like "16px") back
 *  to a numeric pixel value. Returns NaN when unparseable. */
export function parseFontSizeCss(s: string | null | undefined): number {
  if (!s) return NaN;
  return parseFloat(s);
}
