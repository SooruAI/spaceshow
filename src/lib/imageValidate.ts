/** Image upload validator. Three-layer check so a renamed `photo.gif` → `photo.png`
 *  (MIME + extension both claim PNG) is still caught via magic-byte sniff.
 *
 *  Whitelist: PNG, JPEG, WebP, SVG, BMP.
 *  Hard-rejects: GIF, any video, APNG, AVIF.
 */

const ALLOWED_MIMES: ReadonlyArray<string> = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
];

const ALLOWED_EXTS: ReadonlyArray<string> = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
  ".bmp",
];

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

function getExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i).toLowerCase();
}

type Sniffed =
  | "gif"
  | "mp4ish"
  | "webm"
  | "png"
  | "jpeg"
  | "webp"
  | "bmp"
  | "svg"
  | "unknown";

function sniffMagic(bytes: Uint8Array): Sniffed {
  if (bytes.length < 4) return "unknown";
  // GIF: "GIF8"
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "gif";
  }
  // MP4 / MOV / 3GP: ???? "ftyp" at bytes 4-7
  if (
    bytes.length >= 8 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return "mp4ish";
  }
  // WebM/Matroska: 1A 45 DF A3
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "webm";
  }
  // PNG: 89 50 4E 47
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  // WebP: "RIFF" (0-3) ... "WEBP" (8-11)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  // BMP: "BM"
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "bmp";
  // SVG: ASCII "<" or "<?xml" or BOM+"<" → detect via text. Best-effort.
  if (bytes[0] === 0x3c) return "svg";
  if (
    bytes.length >= 5 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf &&
    bytes[3] === 0x3c
  ) {
    return "svg";
  }
  return "unknown";
}

/** Sniffs the first 12 bytes of the file, cross-checks MIME + extension,
 *  and rejects GIFs, videos, and anything not on the whitelist. */
export async function validateImageFile(
  file: File
): Promise<ValidationResult> {
  if (!file || file.size === 0) {
    return { ok: false, reason: "Couldn't read this image." };
  }

  const buf = await file.slice(0, 12).arrayBuffer();
  const bytes = new Uint8Array(buf);
  const sniff = sniffMagic(bytes);

  // Hard rejections based on content, regardless of MIME/ext.
  if (sniff === "gif") {
    return {
      ok: false,
      reason: "GIFs aren't supported — use a static image.",
    };
  }
  if (sniff === "mp4ish" || sniff === "webm") {
    return { ok: false, reason: "Videos aren't supported." };
  }

  const mime = (file.type || "").toLowerCase();
  const ext = getExt(file.name || "");

  if (mime.startsWith("video/")) {
    return { ok: false, reason: "Videos aren't supported." };
  }
  if (mime === "image/gif" || ext === ".gif") {
    return {
      ok: false,
      reason: "GIFs aren't supported — use a static image.",
    };
  }
  if (mime === "image/apng" || mime === "image/avif") {
    return {
      ok: false,
      reason: "Unsupported file type. Use PNG, JPEG, WebP, SVG, or BMP.",
    };
  }

  const mimeOk = mime ? ALLOWED_MIMES.includes(mime) : false;
  const extOk = ext ? ALLOWED_EXTS.includes(ext) : false;
  const sniffOk =
    sniff === "png" ||
    sniff === "jpeg" ||
    sniff === "webp" ||
    sniff === "bmp" ||
    sniff === "svg";

  if (!mimeOk && !extOk) {
    return {
      ok: false,
      reason: "Unsupported file type. Use PNG, JPEG, WebP, SVG, or BMP.",
    };
  }
  if (!sniffOk) {
    return {
      ok: false,
      reason: "Unsupported file type. Use PNG, JPEG, WebP, SVG, or BMP.",
    };
  }

  return { ok: true };
}
