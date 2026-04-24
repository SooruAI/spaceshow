import type { TipTapDoc } from "../../types";

/**
 * Recursively flattens a TipTap JSON document to plain text.
 * Good enough for truncation / list previews — doesn't preserve marks,
 * mentions are rendered as "@name" (mention nodes carry `attrs.label` or
 * `attrs.id`), emoji are already plain text from our insertContent call.
 */
export function docToText(doc: TipTapDoc | undefined | null): string {
  if (!doc) return "";
  const out: string[] = [];
  walk(doc as unknown as Node, out);
  return out.join("").replace(/\s+/g, " ").trim();
}

interface Node {
  type?: string;
  text?: string;
  attrs?: { id?: string; label?: string };
  content?: Node[];
}

function walk(n: Node, out: string[]): void {
  if (!n) return;
  if (typeof n.text === "string") {
    out.push(n.text);
    return;
  }
  if (n.type === "mention") {
    const label = n.attrs?.label ?? n.attrs?.id ?? "";
    out.push(`@${label}`);
    return;
  }
  if (n.type === "hardBreak") {
    out.push(" ");
    return;
  }
  if (Array.isArray(n.content)) {
    for (const c of n.content) walk(c, out);
    // separate block-level children with a space so paragraphs don't smush.
    if (n.type && /paragraph|heading|listItem|blockquote/.test(n.type)) {
      out.push(" ");
    }
  }
}
