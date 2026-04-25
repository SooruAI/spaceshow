import { Download, X } from "lucide-react";
import { useEffect } from "react";

interface Props {
  fileUrl: string;
  fileName: string;
  onClose: () => void;
}

/**
 * Full-viewport image preview. Mounted by `AttachmentChip` when the user
 * clicks an image attachment — preferable to a new-tab open because the
 * user stays anchored in the comment context. PDFs intentionally don't
 * use this (they're heavier; the browser's native PDF viewer in a new
 * tab is a better fit).
 *
 * Tagged with `data-comment-popover-keep-open` so `<ThreadPopover />`'s
 * outside-click dismissal exempts clicks on the lightbox — opening a
 * preview shouldn't tear down the thread you're previewing inside of.
 *
 * Dismiss paths:
 *   - X button.
 *   - Esc — registered in CAPTURE phase with `stopImmediatePropagation`
 *     so the popover's own bubble-phase Esc handler doesn't ALSO close
 *     it. The user pressing Esc to dismiss the lightbox shouldn't
 *     additionally close the popover behind it.
 *   - Click on the dimmed backdrop (the image stops propagation so
 *     clicking the image itself doesn't dismiss).
 *
 * Download is a separate action: a hidden anchor with `download={fileName}`
 * that re-uses the data URL. The browser saves with the original
 * filename instead of a `.bin`-style download-from-data-url default.
 */
export function LightboxModal({ fileUrl, fileName, onClose }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        // Stop the popover's keydown listener from also firing — we
        // only want to close the lightbox, not the popover under it.
        e.stopImmediatePropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      onMouseDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-label={`Preview of ${fileName}`}
      aria-modal="true"
      data-comment-popover-keep-open=""
    >
      {/* Top action bar — filename left, download + close right. The
          gradient gives legibility without a hard line under bright
          images. */}
      <div
        className="absolute top-0 left-0 right-0 h-12 px-4 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm font-medium truncate pr-3">{fileName}</span>
        <div className="flex items-center gap-1 shrink-0">
          <a
            href={fileUrl}
            download={fileName}
            className="w-8 h-8 inline-flex items-center justify-center rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
            title={`Download ${fileName}`}
            aria-label={`Download ${fileName}`}
          >
            <Download size={16} />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 inline-flex items-center justify-center rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
            title="Close (Esc)"
            aria-label="Close preview"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      {/* Image — clicks on it don't dismiss (only the backdrop does). */}
      <img
        src={fileUrl}
        alt={fileName}
        className="max-w-[90vw] max-h-[90vh] object-contain shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
