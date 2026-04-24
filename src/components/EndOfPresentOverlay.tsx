import { useStore } from "../store";

/**
 * Black fade-in overlay shown after the viewer advances past the final
 * slide. Gives the presentation a cinematic conclusion rather than dumping
 * the user back into the editor abruptly.
 *
 * Keyboard: ArrowLeft/Q/Esc are handled centrally in `usePresenterKeys`
 * (via PresenterView). The buttons here are a click-friendly backup.
 */
export function EndOfPresentOverlay() {
  const returnToLast = useStore((s) => s.returnToLastSlide);
  const quit = useStore((s) => s.quitPresentation);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center animate-fade-in text-ink-100"
      style={{ background: "#000" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="space-present-end-title"
    >
      <h1
        id="space-present-end-title"
        className="font-heading text-[32px] font-semibold tracking-tight text-ink-100"
      >
        End of SpacePresent
      </h1>
      <p className="mt-3 text-sm text-ink-400">
        Press <Kbd>←</Kbd> to jump back to the last slide, or{" "}
        <Kbd>Esc</Kbd> to exit.
      </p>
      <div className="mt-8 flex items-center gap-3">
        <button
          type="button"
          onClick={returnToLast}
          className="pill-btn"
          autoFocus
        >
          Back to last slide
        </button>
        <button
          type="button"
          onClick={quit}
          className="pill-btn pill-btn-accent"
        >
          Exit
        </button>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 px-1.5 py-0.5 text-[11px] rounded-md bg-ink-800 border border-ink-700 text-ink-200 font-mono">
      {children}
    </kbd>
  );
}
