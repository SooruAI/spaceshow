/**
 * MarkerEnds — two MarkerDropdowns separated by a Swap button.
 * Kept as its own component so `LineToolMenu` stays flat.
 */

import { ArrowLeftRight } from "lucide-react";
import { useStore } from "../../store";
import { MarkerDropdown } from "./MarkerDropdown";

export function MarkerEnds() {
  const startMarker = useStore((s) => s.lineStartMarker);
  const endMarker = useStore((s) => s.lineEndMarker);
  const setStart = useStore((s) => s.setLineStartMarker);
  const setEnd = useStore((s) => s.setLineEndMarker);
  const swap = useStore((s) => s.swapLineMarkers);

  return (
    <div className="flex items-center gap-1">
      <MarkerDropdown
        value={startMarker}
        onChange={setStart}
        direction="start"
        ariaLabel="Start marker"
      />
      <button
        type="button"
        onClick={swap}
        aria-label="Swap start and end markers"
        title="Swap ends"
        className="w-6 h-6 grid place-items-center rounded hover:bg-ink-700 text-ink-300 hover:text-ink-100 transition-colors"
      >
        <ArrowLeftRight size={12} />
      </button>
      <MarkerDropdown
        value={endMarker}
        onChange={setEnd}
        direction="end"
        ariaLabel="End marker"
      />
    </div>
  );
}
