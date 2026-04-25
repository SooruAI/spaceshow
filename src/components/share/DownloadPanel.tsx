import { ArrowLeft, Download } from "lucide-react";
import { SlideSelector } from "./SlideSelector";
import {
  FORMATS_BY_MODE,
  type ExportFormat,
  type ExportMode,
} from "./shareTypes";

interface Props {
  mode: ExportMode;
  format: ExportFormat;
  selectedSheetIds: Set<string>;
  onModeChange: (mode: ExportMode) => void;
  onFormatChange: (format: ExportFormat) => void;
  onToggleSheet: (id: string) => void;
  onSelectIds: (ids: string[]) => void;
  onDeselectIds: (ids: string[]) => void;
  onDownload: () => void;
  onBack: () => void;
}

export function DownloadPanel({
  mode,
  format,
  selectedSheetIds,
  onModeChange,
  onFormatChange,
  onToggleSheet,
  onSelectIds,
  onDeselectIds,
  onDownload,
  onBack,
}: Props) {
  const formats = FORMATS_BY_MODE[mode];
  const slideMode = mode === "slides";
  const downloadDisabled = slideMode && selectedSheetIds.size === 0;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onBack}
          className="w-7 h-7 grid place-items-center rounded-md text-ink-300 hover:text-ink-100 hover:bg-ink-700 transition-colors"
          aria-label="Back to share"
          title="Back"
        >
          <ArrowLeft size={14} />
        </button>
        <div className="text-[13px] font-semibold text-ink-100">Download / Export</div>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wide text-ink-400 font-semibold mb-1.5 px-0.5">
          What to export
        </div>
        <div className="flex items-center bg-ink-700 rounded-md p-[3px]">
          <ModeTab
            label="Entire Board"
            active={mode === "board"}
            onClick={() => onModeChange("board")}
          />
          <ModeTab
            label="Select Slides"
            active={mode === "slides"}
            onClick={() => onModeChange("slides")}
          />
        </div>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wide text-ink-400 font-semibold mb-1.5 px-0.5">
          Format
        </div>
        <div className="flex flex-wrap gap-1.5">
          {formats.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onFormatChange(f)}
              className={`h-7 px-2.5 rounded-md text-[12px] font-medium transition-colors ${
                format === f
                  ? "bg-brand-600 text-white"
                  : "bg-ink-700 text-ink-200 hover:bg-ink-600"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {slideMode && (
        <SlideSelector
          selectedSheetIds={selectedSheetIds}
          onToggle={onToggleSheet}
          onSelectIds={onSelectIds}
          onDeselectIds={onDeselectIds}
        />
      )}

      <button
        type="button"
        onClick={onDownload}
        disabled={downloadDisabled}
        title={downloadDisabled ? "Select at least one slide" : `Download as ${format}`}
        aria-disabled={downloadDisabled}
        className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-600 hover:bg-brand-500 text-white text-[12px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-brand-600"
      >
        <Download size={14} />
        Download {format}
      </button>
    </div>
  );
}

function ModeTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 h-7 rounded-[5px] text-[12px] font-semibold transition-colors ${
        active ? "bg-brand-600 text-white shadow-sm" : "text-ink-300 hover:text-ink-100"
      }`}
    >
      {label}
    </button>
  );
}
