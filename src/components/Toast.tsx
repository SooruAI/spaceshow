import { useStore } from "../store";

/** Global toast pill. Bottom-centered, auto-dismisses via the store slice's
 *  own timer. Two levels: "info" (neutral teal border) and "error" (red). */
export function Toast() {
  const toast = useStore((s) => s.toast);
  const hideToast = useStore((s) => s.hideToast);
  if (!toast) return null;
  const isError = toast.level === "error";
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-8 z-[60] flex justify-center">
      <button
        type="button"
        onClick={hideToast}
        className={[
          "pointer-events-auto max-w-[520px] px-4 py-2 rounded-md shadow-lg text-sm",
          "border backdrop-blur bg-ink-700/95 text-ink-100",
          isError ? "border-red-500/70" : "border-brand-500/60",
        ].join(" ")}
        aria-live="polite"
        role="status"
      >
        {toast.message}
      </button>
    </div>
  );
}
