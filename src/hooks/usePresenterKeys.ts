import { useEffect } from "react";
import { useStore } from "../store";

export interface PresenterKeysConfig {
  onNext?: () => void;
  onPrev?: () => void;
  onQuit?: () => void;
  /** Only fires when filter-style cycling applies (selection modal). */
  onCycleFilter?: (dir: 1 | -1) => void;
  onConfirm?: () => void;
  onReturnToLast?: () => void;
}

/**
 * Window-level, capture-phase keyboard handler for the SpacePresent feature.
 * Routes keys based on `presentationStatus`:
 *
 * - `selecting`: ArrowLeft/Right cycle the filter tabs; Enter confirms;
 *    Escape/Q cancel.
 * - `presenting`: Arrow/Tab/Space/Enter navigate slides; P/T/E/C toggle
 *    tools; Shift+E flips eraser pixel/object. Esc is progressive —
 *    if an annotation tool (pen/eraser/torch) is active it returns to
 *    cursor (also dismissing the tool-settings popover); a second Esc
 *    (or any Esc while cursor is active) quits with exit fade. Q is an
 *    unconditional hard-quit.
 * - `ended`: ArrowLeft returns to the last slide; Esc/Q quit.
 *
 * Events are captured and both `preventDefault` + `stopPropagation` are
 * called so they never bubble into `useShortcuts` (which also guards on
 * `presentationStatus !== "idle"` as a belt-and-braces fallback).
 */
export function usePresenterKeys(cfg: PresenterKeysConfig) {
  const status = useStore((s) => s.presentationStatus);
  const setTool = useStore((s) => s.setPresentationTool);
  const currentTool = useStore((s) => s.presentationTool);
  const eraserMode = useStore((s) => s.presentationEraserMode);
  const setEraserMode = useStore((s) => s.setPresentationEraserMode);

  useEffect(() => {
    if (status === "idle") return;

    function handle(e: KeyboardEvent) {
      // Ignore keys originating from form inputs — there shouldn't be any
      // in the presenter, but this is cheap insurance.
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      const key = e.key;

      function stop() {
        e.preventDefault();
        e.stopPropagation();
      }

      if (status === "selecting") {
        if (key === "Escape" || key === "q" || key === "Q") {
          stop();
          cfg.onQuit?.();
          return;
        }
        if (key === "Enter") {
          stop();
          cfg.onConfirm?.();
          return;
        }
        if (key === "ArrowLeft") {
          stop();
          cfg.onCycleFilter?.(-1);
          return;
        }
        if (key === "ArrowRight") {
          stop();
          cfg.onCycleFilter?.(1);
          return;
        }
        return;
      }

      if (status === "ended") {
        if (key === "Escape" || key === "q" || key === "Q") {
          stop();
          cfg.onQuit?.();
          return;
        }
        if (key === "ArrowLeft" || key === "a" || key === "A") {
          stop();
          cfg.onReturnToLast?.();
          return;
        }
        return;
      }

      // status === "presenting"
      // Progressive Escape:
      //   - If an annotation tool (pen / eraser / torch) is active, the first
      //     Esc demotes the tool back to "cursor". That also unmounts the
      //     tool-settings popover, which is gated on pen/eraser.
      //   - If the cursor is already active, Esc quits the show.
      // Q is an unconditional hard-quit regardless of current tool.
      if (key === "Escape") {
        stop();
        if (currentTool !== "cursor") {
          setTool("cursor");
        } else {
          cfg.onQuit?.();
        }
        return;
      }
      if (key === "q" || key === "Q") {
        stop();
        cfg.onQuit?.();
        return;
      }
      if (key === "p" || key === "P") {
        stop();
        setTool(currentTool === "pen" ? "cursor" : "pen");
        return;
      }
      if (key === "t" || key === "T") {
        stop();
        setTool(currentTool === "torch" ? "cursor" : "torch");
        return;
      }
      if (key === "c" || key === "C") {
        stop();
        setTool("cursor");
        return;
      }
      // E — toggle eraser (no modifier). Shift+E — flip pixel/object while
      // the eraser tool is already active; no-op otherwise. Shift-state is
      // checked first because `key` is already uppercase ("E") when Shift
      // is held.
      if (key === "e" || key === "E") {
        stop();
        if (e.shiftKey) {
          if (currentTool === "eraser") {
            setEraserMode(eraserMode === "pixel" ? "object" : "pixel");
          }
        } else {
          setTool(currentTool === "eraser" ? "cursor" : "eraser");
        }
        return;
      }
      // Next navigation
      if (
        key === "ArrowRight" ||
        key === "d" ||
        key === "D" ||
        key === " " ||
        key === "Spacebar" ||
        key === "Enter" ||
        key === "Return" ||
        (key === "Tab" && !e.shiftKey)
      ) {
        stop();
        cfg.onNext?.();
        return;
      }
      // Prev navigation
      if (
        key === "ArrowLeft" ||
        key === "a" ||
        key === "A" ||
        key === "Delete" ||
        key === "Backspace" ||
        (key === "Tab" && e.shiftKey)
      ) {
        stop();
        cfg.onPrev?.();
        return;
      }
    }

    // Capture phase so we beat the editor's keydown handlers.
    window.addEventListener("keydown", handle, true);
    return () => window.removeEventListener("keydown", handle, true);
  }, [status, cfg, setTool, currentTool, eraserMode, setEraserMode]);
}
