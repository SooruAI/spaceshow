import { useStore } from "../store";
import { usePresenterKeys } from "../hooks/usePresenterKeys";
import { SheetSelectionModal } from "./SheetSelectionModal";
import { PresenterView } from "./PresenterView";
import { EndOfPresentOverlay } from "./EndOfPresentOverlay";

/**
 * Thin router for the SpacePresent feature. The editor mounts this component
 * whenever `presentationStatus !== "idle"`; it picks the right sub-view:
 *
 *   - `selecting`  → <SheetSelectionModal />
 *   - `presenting` → <PresenterView />
 *   - `ended`      → <EndOfPresentOverlay />
 *
 * Keyboard handling lives in each sub-state's own `usePresenterKeys` call.
 * PresenterView registers its own while mounted; selecting/ended are
 * handled here. Each `usePresenterKeys` call short-circuits on its own
 * status check, so the two instances don't conflict.
 */
export function SpacePresent() {
  const status = useStore((s) => s.presentationStatus);
  const cancelPresentation = useStore((s) => s.cancelPresentation);
  const confirmPresentation = useStore((s) => s.confirmPresentation);
  const returnToLastSlide = useStore((s) => s.returnToLastSlide);
  const quitPresentation = useStore((s) => s.quitPresentation);
  const setFilter = useStore((s) => s.setPresentationSheetFilter);
  const filter = useStore((s) => s.presentationSheetFilter);

  usePresenterKeys({
    onQuit: status === "selecting" ? cancelPresentation : quitPresentation,
    onConfirm: confirmPresentation,
    onReturnToLast: returnToLastSlide,
    onCycleFilter: (dir) => {
      const order: Array<"unhidden" | "all" | "hidden"> = [
        "unhidden",
        "all",
        "hidden",
      ];
      const i = order.indexOf(filter);
      const nextIdx = (i + dir + order.length) % order.length;
      setFilter(order[nextIdx]);
    },
  });

  if (status === "selecting") return <SheetSelectionModal />;
  if (status === "presenting") return <PresenterView />;
  if (status === "ended") return <EndOfPresentOverlay />;
  return null;
}
