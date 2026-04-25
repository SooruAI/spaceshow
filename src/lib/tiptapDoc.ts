// ─────────────────────────────────────────────────────────────────────────────
// tiptapDoc.ts — central Tiptap-document plumbing for SpaceShow rich text.
//
// Every read of a TextContent's "what does this look like" is mediated through
// the helpers here, and every write of a TextContent's `doc` MUST go through
// `applyDoc`. That single choke point is what keeps `doc`, the derived plain
// `text`, and the lead-run/paragraph snapshot (flat fields) in lockstep.
//
// Design rules (from the rich-text plan):
//   1. `doc` is the source of truth when present. Renderers read `doc` and
//      ignore the flat fields. Flat fields are only a *snapshot* of the lead
//      run/paragraph for legacy readers + the fast-path renderer.
//   2. When `doc` is absent (legacy data, fresh shape, tool-active defaults),
//      flat fields are the source. Migration to `doc` is lazy — kicks in only
//      on first edit via `migrateTextContent`.
//   3. `text = deriveText(doc)` is always in sync. Search, export, and any
//      future server-side consumer can keep reading `text` and Just Work.
//   4. `doc` and `text` are NEVER set separately. Every write goes through
//      `applyDoc`, which atomically updates both + the flat-field snapshot.
//
// The intentionally-untyped TipTapDoc alias (src/types.ts:503) keeps the
// store/component seam free of @tiptap/* type pollution. Inside this file we
// know what shape Tiptap emits and we type the local helpers tightly.
// ─────────────────────────────────────────────────────────────────────────────

import type { TextContent, TipTapDoc } from "../types";

// ── Internal node shapes ────────────────────────────────────────────────────
// Mirror Tiptap's JSONContent enough to walk + build docs without dragging in
// @tiptap/core types at this seam.

type Mark = {
  type: string;
  attrs?: Record<string, unknown>;
};

type Node = {
  type: string;
  attrs?: Record<string, unknown>;
  marks?: Mark[];
  text?: string;
  content?: Node[];
};

type Doc = TipTapDoc & { content?: Node[] };

const SCHEMA_VERSION = 1;

// ── Public helpers ──────────────────────────────────────────────────────────

/** True when the doc has at least one text-bearing node. Used by isTextElement
 *  and the "should I render via doc?" branch. */
export function hasDocContent(doc: TipTapDoc | undefined): boolean {
  if (!doc) return false;
  const d = doc as Doc;
  if (!d.content || d.content.length === 0) return false;
  return d.content.some(nodeHasText);
}

function nodeHasText(n: Node): boolean {
  if (n.type === "text" && n.text && n.text.length > 0) return true;
  if (n.content) return n.content.some(nodeHasText);
  return false;
}

/** Flatten a doc to the plain string used by search/export/legacy readers.
 *  Paragraph + heading + list-item boundaries become "\n". */
export function deriveText(doc: TipTapDoc | undefined): string {
  if (!doc) return "";
  const d = doc as Doc;
  if (!d.content) return "";
  const lines: string[] = [];
  for (const node of d.content) {
    collectLines(node, lines);
  }
  // Trim trailing empties so a one-paragraph doc doesn't produce "Hello\n".
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

function collectLines(node: Node, out: string[]): void {
  if (node.type === "paragraph" || node.type === "heading") {
    out.push(textOfBlock(node));
    return;
  }
  if (node.type === "bulletList" || node.type === "orderedList") {
    if (node.content) for (const li of node.content) collectLines(li, out);
    return;
  }
  if (node.type === "listItem") {
    // List items wrap one or more paragraph nodes; emit each as its own line.
    if (node.content) for (const c of node.content) collectLines(c, out);
    return;
  }
  // Unknown node — try to recurse for safety.
  if (node.content) for (const c of node.content) collectLines(c, out);
}

function textOfBlock(node: Node): string {
  if (!node.content) return "";
  let s = "";
  for (const c of node.content) {
    if (c.type === "text" && c.text) s += c.text;
    else if (c.type === "hardBreak") s += "\n";
    else if (c.content) s += textOfBlock(c);
  }
  return s;
}

/** True when the doc collapses to a single styled run that the existing
 *  Konva `<Text>` node can render byte-identically. Used to gate the fast
 *  path in RichTextRender — most text is single-run, so we avoid the custom
 *  layout machinery for ~90% of shapes. */
export function docIsTrivial(doc: TipTapDoc | undefined): boolean {
  if (!doc) return true;
  const d = doc as Doc;
  if (!d.content) return true;
  // 0 or 1 paragraph; no list; if 1 paragraph it must be a "paragraph" (not a
  // heading, since a heading carries an implicit style override) with at most
  // one text node and no inline marks.
  if (d.content.length === 0) return true;
  if (d.content.length > 1) return false;
  const block = d.content[0];
  if (block.type !== "paragraph") return false;
  // Paragraph alignment override → not trivial (we still render via flat
  // align field so this is fine; but be conservative).
  const align = (block.attrs && (block.attrs.textAlign as string | undefined)) || "left";
  if (align !== "left" && align !== "center" && align !== "right" && align !== "justify") {
    return false;
  }
  if (!block.content || block.content.length === 0) return true;
  if (block.content.length > 1) return false;
  const run = block.content[0];
  if (run.type !== "text") return false;
  if (run.marks && run.marks.length > 0) return false;
  return true;
}

/** Lift the lead run/paragraph attrs into the flat-field snapshot. Used both
 *  by `applyDoc` (snapshot stays in sync with doc) and at migration time to
 *  preserve the user's existing styling defaults across the boundary. */
export function extractSnapshotAttrs(
  doc: TipTapDoc | undefined,
  fallback: TextContent,
): Pick<
  TextContent,
  | "font"
  | "fontSize"
  | "color"
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "align"
  | "bullets"
  | "indent"
  | "bgColor"
> {
  const out = {
    font: fallback.font,
    fontSize: fallback.fontSize,
    color: fallback.color,
    bold: fallback.bold,
    italic: fallback.italic,
    underline: fallback.underline,
    strike: fallback.strike,
    align: fallback.align,
    bullets: fallback.bullets,
    indent: fallback.indent,
    bgColor: fallback.bgColor,
  };
  if (!doc) return out;
  const d = doc as Doc;
  if (!d.content || d.content.length === 0) return out;

  // Find the first block-level node we recognise.
  const block = findFirstBlock(d.content);
  if (!block) return out;

  // Paragraph alignment.
  const align = block.attrs && (block.attrs.textAlign as string | undefined);
  if (align === "left" || align === "center" || align === "right" || align === "justify") {
    out.align = align;
  }

  // List context.
  const list = findEnclosingList(d.content, block);
  if (list === "bulletList") out.bullets = "bulleted";
  else if (list === "orderedList") out.bullets = "numbered";

  // Lead inline run on that block.
  const run = firstTextRun(block);
  if (run) {
    const marks = run.marks ?? [];
    for (const m of marks) {
      if (m.type === "bold") out.bold = true;
      else if (m.type === "italic") out.italic = true;
      else if (m.type === "underline") out.underline = true;
      else if (m.type === "strike") out.strike = true;
      else if (m.type === "textStyle") {
        const a = m.attrs ?? {};
        if (typeof a.color === "string") out.color = a.color;
        if (typeof a.fontFamily === "string") out.font = a.fontFamily;
        if (typeof a.fontSize === "number") out.fontSize = a.fontSize;
        else if (typeof a.fontSize === "string") {
          const px = parseFloat(a.fontSize);
          if (Number.isFinite(px)) out.fontSize = px;
        }
      } else if (m.type === "highlight") {
        const a = m.attrs ?? {};
        if (typeof a.color === "string") out.bgColor = a.color;
      }
    }
  }

  // Heading auto-bolds + bumps size in our default-style table; reflect that
  // in the snapshot so legacy readers see something sensible.
  if (block.type === "heading") {
    const lvl = (block.attrs && (block.attrs.level as number | undefined)) ?? 1;
    out.bold = true;
    if (lvl === 1) out.fontSize = Math.max(out.fontSize, 24);
    else if (lvl === 2) out.fontSize = Math.max(out.fontSize, 20);
    else out.fontSize = Math.max(out.fontSize, 18);
  }

  return out;
}

function findFirstBlock(content: Node[]): Node | undefined {
  for (const n of content) {
    if (n.type === "paragraph" || n.type === "heading") return n;
    if (n.type === "bulletList" || n.type === "orderedList") {
      if (n.content) {
        for (const li of n.content) {
          if (li.type === "listItem" && li.content) {
            for (const inner of li.content) {
              if (inner.type === "paragraph" || inner.type === "heading") return inner;
            }
          }
        }
      }
    }
  }
  return undefined;
}

function findEnclosingList(
  content: Node[],
  target: Node,
): "bulletList" | "orderedList" | undefined {
  for (const n of content) {
    if (n.type === "bulletList" || n.type === "orderedList") {
      if (containsNode(n, target)) {
        return n.type as "bulletList" | "orderedList";
      }
    }
  }
  return undefined;
}

function containsNode(parent: Node, target: Node): boolean {
  if (parent === target) return true;
  if (!parent.content) return false;
  for (const c of parent.content) {
    if (containsNode(c, target)) return true;
  }
  return false;
}

function firstTextRun(block: Node): Node | undefined {
  if (!block.content) return undefined;
  for (const c of block.content) {
    if (c.type === "text") return c;
  }
  return undefined;
}

/** Build a fresh Tiptap doc from a flat TextContent. Used at migration time
 *  (first edit on legacy data) and to seed brand-new shapes whose defaults
 *  live in the flat fields. Result is shape-equivalent to what Tiptap would
 *  emit on a clean editor seeded with the same plain text + format. */
export function migrateTextContent(t: TextContent): TextContent {
  if (t.doc && hasDocContent(t.doc)) return t;

  const text = t.text ?? "";
  const lines = text.split("\n");

  const marks: Mark[] = [];
  if (t.bold) marks.push({ type: "bold" });
  if (t.italic) marks.push({ type: "italic" });
  if (t.underline) marks.push({ type: "underline" });
  if (t.strike) marks.push({ type: "strike" });
  const styleAttrs: Record<string, unknown> = {};
  if (t.color) styleAttrs.color = t.color;
  if (t.font) styleAttrs.fontFamily = t.font;
  if (typeof t.fontSize === "number") styleAttrs.fontSize = t.fontSize;
  if (Object.keys(styleAttrs).length > 0) {
    marks.push({ type: "textStyle", attrs: styleAttrs });
  }
  if (t.bgColor) {
    marks.push({ type: "highlight", attrs: { color: t.bgColor } });
  }

  const paragraphAttrs: Record<string, unknown> = {};
  if (t.align && t.align !== "left") paragraphAttrs.textAlign = t.align;

  function makeParagraph(line: string): Node {
    const para: Node = {
      type: "paragraph",
      attrs: Object.keys(paragraphAttrs).length ? { ...paragraphAttrs } : undefined,
    };
    if (line.length > 0) {
      para.content = [
        {
          type: "text",
          text: line,
          marks: marks.length ? marks.map((m) => ({ ...m })) : undefined,
        },
      ];
    }
    return para;
  }

  let blocks: Node[];
  if (t.bullets === "bulleted" || t.bullets === "numbered") {
    const listItems: Node[] = lines.map((line) => ({
      type: "listItem",
      content: [makeParagraph(line)],
    }));
    blocks = [
      {
        type: t.bullets === "bulleted" ? "bulletList" : "orderedList",
        content: listItems.length ? listItems : [{ type: "listItem", content: [makeParagraph("")] }],
      },
    ];
  } else {
    blocks = (lines.length ? lines : [""]).map(makeParagraph);
  }

  const doc: Doc = { type: "doc", content: blocks };

  return {
    ...t,
    doc,
    version: SCHEMA_VERSION,
    text: deriveText(doc),
  };
}

/** Idempotent helper: produce the next TextContent given a new doc. Atomically
 *  updates `doc`, recomputes `text`, refreshes the flat-field snapshot. Call
 *  this from every place that mutates `doc` — Tiptap onUpdate handlers, paste
 *  ops, programmatic edits, etc. NEVER set `doc` and `text` separately. */
export function applyDoc(prev: TextContent, doc: TipTapDoc): TextContent {
  const snap = extractSnapshotAttrs(doc, prev);
  return {
    ...prev,
    ...snap,
    doc,
    version: SCHEMA_VERSION,
    text: deriveText(doc),
  };
}

/** Convenience: same as applyDoc but accepts a partial patch (e.g. from the
 *  toolbar adjusting flat-field defaults that should also bump the doc's lead
 *  run). For now this is just `applyDoc`-after-doc-rebuild via migrate; we
 *  expose it so callers don't reach for `migrateTextContent` directly when
 *  they only meant to flush flat-field changes. */
export function applyFlatPatch(prev: TextContent, patch: Partial<TextContent>): TextContent {
  // Flat-field-only patch; no doc rebuild. The doc remains the source of
  // truth, and snapshot fields will be re-derived next time applyDoc runs.
  return { ...prev, ...patch };
}

/** Test seam: schema version constant for callers that want to gate on it. */
export const TEXT_CONTENT_SCHEMA_VERSION = SCHEMA_VERSION;
