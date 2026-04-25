import { Download, FileText, ImageIcon, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Attachment } from "../../types";
import { LightboxModal } from "./LightboxModal";

interface Props {
  attachment: Pick<Attachment, "fileType" | "fileName" | "fileUrl">;
  onRemove?: () => void;
}

/**
 * Convert a `data:` URL into a `blob:` URL with the same MIME type. Used
 * for PDF attachments — Chrome (and intermittently other Chromium
 * derivatives) blocks top-level navigation to `data:application/pdf`
 * URLs from `<a target="_blank">` as a security measure, which makes
 * PDF chip clicks silently no-op. Blob URLs are exempt and reliably
 * open in the browser's native PDF viewer in a new tab.
 *
 * Caller owns lifetime — every blob URL must be paired with a
 * `URL.revokeObjectURL` (handled by the chip's effect cleanup).
 */
function dataUrlToBlobUrl(dataUrl: string): string {
  const commaIdx = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, commaIdx);
  const base64 = dataUrl.slice(commaIdx + 1);
  const mimeMatch = meta.match(/^data:([^;]+)/);
  const mime = mimeMatch?.[1] ?? "application/octet-stream";
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([arr], { type: mime }));
}

/**
 * A small pill representing an image or PDF attachment. For images we
 * render the actual thumbnail inline; PDFs fall back to the generic doc
 * icon.
 *
 * Click behavior:
 *   - **Image**: opens a `<LightboxModal />` that overlays the popover so
 *     the user stays in the comment context while previewing.
 *   - **PDF**: lets the underlying `<a target="_blank">` navigate — the
 *     browser's native PDF viewer is a better fit than an inline modal.
 *
 * Two secondary actions (`<a>` siblings, kept outside the primary anchor
 * because nesting interactive elements inside an anchor is invalid HTML):
 *   - Download — hover-revealed (also visible while the chip has keyboard
 *     focus via `group-focus-within`). Uses `download={fileName}` so the
 *     file saves with its original name instead of a `.bin` default.
 *   - Remove (X) — only when `onRemove` is passed (composer pre-submit).
 */
export function AttachmentChip({ attachment, onRemove }: Props) {
  const { fileType, fileName, fileUrl } = attachment;
  const isImage = fileType === "image";
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // For PDFs, route the open link through a blob URL — see the
  // `dataUrlToBlobUrl` doc above. Images skip this and stay on the
  // original data URL since the lightbox renders them inline (no
  // top-level navigation, so the data-URL restriction never applies).
  // Created in an effect (not useMemo) so React strict-mode's
  // double-invocation cleanup pairs the right URL with its revocation.
  const [navigateUrl, setNavigateUrl] = useState<string>(fileUrl);
  useEffect(() => {
    if (isImage) {
      setNavigateUrl(fileUrl);
      return;
    }
    const blobUrl = dataUrlToBlobUrl(fileUrl);
    setNavigateUrl(blobUrl);
    return () => URL.revokeObjectURL(blobUrl);
  }, [isImage, fileUrl]);

  function handleOpen(e: React.MouseEvent<HTMLAnchorElement>) {
    if (isImage) {
      // Hijack the navigation: show the lightbox in-place instead.
      e.preventDefault();
      setLightboxOpen(true);
    }
    // PDFs: let the anchor's `target="_blank"` navigation run on the
    // blob URL set above. Browser opens its native PDF viewer in a
    // new tab.
  }

  return (
    <>
      <span
        className="group inline-flex items-center max-w-[180px] h-6 rounded-md bg-ink-800 border border-ink-700 text-[11px] text-ink-200 overflow-hidden"
        title={fileName}
      >
        <a
          href={navigateUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleOpen}
          className="inline-flex items-center gap-1.5 h-full px-1.5 hover:bg-ink-700 transition-colors min-w-0 flex-1"
          aria-label={isImage ? `Preview ${fileName}` : `Open ${fileName}`}
        >
          {isImage ? (
            fileUrl ? (
              <img
                src={fileUrl}
                alt=""
                className="w-4 h-4 object-cover rounded-sm shrink-0"
              />
            ) : (
              <ImageIcon size={12} className="text-ink-300 shrink-0" />
            )
          ) : (
            <FileText size={12} className="text-ink-300 shrink-0" />
          )}
          <span className="truncate">{fileName}</span>
        </a>
        {/* Download — hover-revealed. `opacity-0` keeps the slot in the
            layout (so the filename's truncation budget doesn't shift on
            hover) but hides it visually. `group-focus-within` reveals it
            when keyboard focus enters the chip — a quiet a11y nicety so
            tab-only users can reach it. */}
        <a
          href={fileUrl}
          download={fileName}
          onClick={(e) => e.stopPropagation()}
          className="h-full px-1 inline-flex items-center justify-center text-ink-400 hover:text-ink-100 hover:bg-ink-700 transition-colors border-l border-ink-700 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
          aria-label={`Download ${fileName}`}
          title={`Download ${fileName}`}
        >
          <Download size={11} />
        </a>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="h-full px-1 inline-flex items-center justify-center text-ink-400 hover:text-ink-100 hover:bg-ink-700 transition-colors border-l border-ink-700"
            aria-label={`Remove ${fileName}`}
            title={`Remove ${fileName}`}
          >
            <X size={11} />
          </button>
        )}
      </span>
      {lightboxOpen && isImage && (
        <LightboxModal
          fileUrl={fileUrl}
          fileName={fileName}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}
