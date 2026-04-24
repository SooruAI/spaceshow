import { FileText, ImageIcon, X } from "lucide-react";
import type { Attachment } from "../../types";

interface Props {
  attachment: Pick<Attachment, "fileType" | "fileName" | "fileUrl">;
  onRemove?: () => void;
}

/**
 * A small pill representing an image or PDF attachment. For images we
 * render the actual thumbnail inline; PDFs fall back to the generic doc
 * icon. Pass `onRemove` to show an ✕ button (used by the composer to
 * unstage an attachment before submit).
 */
export function AttachmentChip({ attachment, onRemove }: Props) {
  const { fileType, fileName, fileUrl } = attachment;
  const isImage = fileType === "image";
  return (
    <span
      className="inline-flex items-center gap-1.5 max-w-[180px] h-6 px-1.5 rounded-md bg-ink-800 border border-ink-700 text-[11px] text-ink-200"
      title={fileName}
    >
      {isImage ? (
        fileUrl ? (
          <img
            src={fileUrl}
            alt=""
            className="w-4 h-4 object-cover rounded-sm"
          />
        ) : (
          <ImageIcon size={12} className="text-ink-300" />
        )
      ) : (
        <FileText size={12} className="text-ink-300" />
      )}
      <span className="truncate">{fileName}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-ink-400 hover:text-ink-100"
          aria-label={`Remove ${fileName}`}
        >
          <X size={11} />
        </button>
      )}
    </span>
  );
}
