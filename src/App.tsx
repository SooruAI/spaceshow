import { useEffect, useRef, useState } from "react";
import { PanelLeftOpen, PanelRightOpen } from "lucide-react";
import { TopBar } from "./components/TopBar";
import { LeftSidebar } from "./components/LeftSidebar";
import { Toolbar } from "./components/Toolbar";
import { LineToolMenu } from "./components/LineToolMenu";
import { PenToolMenu } from "./components/PenToolMenu";
import { SheetToolbar } from "./components/SheetToolbar";
import { Canvas } from "./components/Canvas";
import { RightSidebar } from "./components/RightSidebar";
import { BottomBar } from "./components/BottomBar";
import { CommentsSidebar } from "./components/comments/CommentsSidebar";
import { VersionsSidebar } from "./components/versions/VersionsSidebar";
import { SpacePresent } from "./components/SpacePresent";
import { SettingsPanel } from "./components/SettingsPanel";
import { ProfilePanel } from "./components/ProfilePanel";
import { ShortcutsCheatsheet } from "./components/ShortcutsCheatsheet";
import { TextEditOverlay } from "./components/TextEditOverlay";
import { TextFormatBar } from "./components/TextFormatBar";
import { StickyFormatBar } from "./components/StickyFormatBar";
import { ContextMenu } from "./components/ContextMenu";
import { Toast } from "./components/Toast";
import { useStore } from "./store";
import { useShortcuts } from "./hooks/useShortcuts";
import { uploadImageFile, replaceImageSrc } from "./lib/imageUpload";
import { pickViewportSheetId } from "./lib/viewInsert";
import type { Shape } from "./types";

export default function App() {
  const showComments = useStore((s) => s.showComments);
  const showVersions = useStore((s) => s.showVersions);
  const presentationStatus = useStore((s) => s.presentationStatus);
  const showSettings = useStore((s) => s.showSettings);
  const showProfile = useStore((s) => s.showProfile);
  const showShortcuts = useStore((s) => s.showShortcuts);
  const showLeftSidebar = useStore((s) => s.showLeftSidebar);
  const setShowLeftSidebar = useStore((s) => s.setShowLeftSidebar);
  const showRightSidebar = useStore((s) => s.showRightSidebar);
  const openRightPanel = useStore((s) => s.openRightPanel);

  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageFillRef = useRef<HTMLInputElement>(null);
  const imageFillTargetRef = useRef<string | null>(null);
  const imageReplaceRef = useRef<HTMLInputElement>(null);
  const imageReplaceTargetRef = useRef<string | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  // Global keyboard shortcuts — single source of truth; guards built in.
  useShortcuts();

  useEffect(() => {
    function measure() {
      if (!canvasWrapRef.current) return;
      const rect = canvasWrapRef.current.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
      // Mirror into the store so actions that depend on the true canvas
      // viewport (e.g. `zoomToSheet` from the sidebar) don't have to reach
      // for `window.innerWidth/Height`, which is wrong whenever a sidebar,
      // ruler, or top/bottom bar is eating space.
      useStore.getState().setViewportSize(rect.width, rect.height);
    }
    measure();
    const ro = new ResizeObserver(measure);
    if (canvasWrapRef.current) ro.observe(canvasWrapRef.current);
    return () => ro.disconnect();
  }, []);

  // The "U" shortcut dispatches this event so we can reuse the hidden file input.
  useEffect(() => {
    function onUpload() {
      fileRef.current?.click();
    }
    window.addEventListener("spaceshow:upload", onUpload);
    return () => window.removeEventListener("spaceshow:upload", onUpload);
  }, []);

  // ShapeInspector → "Fill with image" dispatches this event with the target
  // shape id so the hidden file input can be opened from a real user click.
  useEffect(() => {
    function onImageFill(ev: Event) {
      const id = (ev as CustomEvent<{ id: string }>).detail?.id ?? null;
      imageFillTargetRef.current = id;
      imageFillRef.current?.click();
    }
    window.addEventListener("spaceshow:image-fill", onImageFill);
    return () =>
      window.removeEventListener("spaceshow:image-fill", onImageFill);
  }, []);

  // ImageOptionsBar → "Replace" dispatches this event with the target image
  // id so the hidden file input can be opened from a real user click.
  useEffect(() => {
    function onImageReplace(ev: Event) {
      const id = (ev as CustomEvent<{ id: string }>).detail?.id ?? null;
      imageReplaceTargetRef.current = id;
      imageReplaceRef.current?.click();
    }
    window.addEventListener("spaceshow:image-replace", onImageReplace);
    return () =>
      window.removeEventListener("spaceshow:image-replace", onImageReplace);
  }, []);

  function onImageFillFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const id = imageFillTargetRef.current;
    e.target.value = "";
    imageFillTargetRef.current = null;
    if (!file || !id) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const st = useStore.getState();
      const sh = st.shapes.find((x) => x.id === id);
      if (!sh || sh.type !== "shape") return;
      st.updateShape(id, {
        style: {
          ...sh.style,
          imageFill: { src, fit: "cover" as const },
        },
      } as Partial<Shape>);
    };
    reader.readAsDataURL(file);
  }

  function handleUpload() {
    fileRef.current?.click();
  }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // Land the upload on whichever sheet is currently most visible in the
    // viewport — not the active sheet, which may have scrolled offscreen.
    // Compute placement in that sheet's local coords so it appears wherever
    // the user is actually looking.
    const targetSheetId = pickViewportSheetId();
    if (!targetSheetId) return;
    const st = useStore.getState();
    const sheet = st.sheets.find((s) => s.id === targetSheetId);
    const vw = st.viewportSize.w;
    const vh = st.viewportSize.h;
    let cx = 80;
    let cy = 80;
    let center = false;
    if (sheet && vw > 0 && vh > 0) {
      const worldCx = (vw / 2 - st.pan.x) / st.zoom;
      const worldCy = (vh / 2 - st.pan.y) / st.zoom;
      cx = worldCx - sheet.x;
      cy = worldCy - sheet.y;
      center = true;
    }
    await uploadImageFile(file, {
      sheetId: targetSheetId,
      x: cx,
      y: cy,
      name: file.name,
      center,
    });
  }

  async function onReplaceFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const id = imageReplaceTargetRef.current;
    e.target.value = "";
    imageReplaceTargetRef.current = null;
    if (!file || !id) return;
    await replaceImageSrc(id, file);
  }

  return (
    <div className="h-full w-full flex flex-col bg-ink-900 text-ink-100">
      <TopBar />
      <div className="flex-1 flex min-h-0 relative">
        {showLeftSidebar && <LeftSidebar />}
        {/* Floating expand button — appears when the left sidebar is
            collapsed so users can always bring it back without leaving
            the canvas or hunting for a shortcut. Sits below the horizontal
            ruler (RULER_SIZE = 28px) so it doesn't overlap tick marks. */}
        {!showLeftSidebar && (
          <button
            type="button"
            onClick={() => setShowLeftSidebar(true)}
            title="Show sidebar"
            aria-label="Show sidebar"
            className="absolute top-10 left-10 z-30 w-8 h-8 rounded-md inline-flex items-center justify-center bg-ink-700 border border-ink-600 text-ink-100 hover:bg-ink-600 shadow-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
          >
            <PanelLeftOpen size={15} />
          </button>
        )}
        <div ref={canvasWrapRef} className="flex-1 relative bg-ink-800">
          <Toolbar onUploadClick={handleUpload} />
          <LineToolMenu />
          <PenToolMenu />
          <Canvas width={size.w} height={size.h} />
          <SheetToolbar />
          <TextEditOverlay />
          {/* StickyFormatBar mounts ABOVE TextFormatBar in the JSX so its
              sibling order matches the visual stacking we want when both are
              up at once: sticky-options pill on top, rich-text pill directly
              beneath it (TextFormatBar shifts its `top` down by one bar-height
              when the active edit target is a sticky). StickyFormatBar is
              selection-driven (single sticky selected, select tool active);
              SelectionToolbar stays unmounted on purpose — ContextMenu
              already covers its action set. */}
          <StickyFormatBar />
          <TextFormatBar />
          <FloatingAddSheet />
        </div>
        {showComments && <CommentsSidebar />}
        {showVersions && <VersionsSidebar />}
        {showRightSidebar && !showComments && !showVersions && <RightSidebar />}
        {/* Mirror of the left-side expand affordance — same style, anchored
            to the right edge so the pattern is symmetric. Only renders when
            the right rail is fully collapsed; while Comments is docked, the
            swap-to-views affordance lives inside the Comments header so it
            doesn't float over the sidebar and silently no-op. Matches the
            left expand button's vertical offset so both sit below the ruler. */}
        {!showRightSidebar && !showComments && !showVersions && (
          <button
            type="button"
            onClick={() => openRightPanel("views")}
            title="Show views"
            aria-label="Show views"
            className="absolute top-10 right-3 z-30 w-8 h-8 rounded-md inline-flex items-center justify-center bg-ink-700 border border-ink-600 text-ink-100 hover:bg-ink-600 shadow-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
          >
            <PanelRightOpen size={15} />
          </button>
        )}
        {showSettings && <SettingsPanel />}
        {showProfile && <ProfilePanel />}
      </div>
      <BottomBar viewportW={size.w} viewportH={size.h} />
      {presentationStatus !== "idle" && <SpacePresent />}
      {showShortcuts && <ShortcutsCheatsheet />}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/bmp"
        className="hidden"
        onChange={onFile}
      />
      <input
        ref={imageFillRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onImageFillFile}
      />
      <input
        ref={imageReplaceRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/bmp"
        className="hidden"
        onChange={onReplaceFile}
      />
      {/* Right-click / two-finger-tap context menu. Lives at the app root
          because it uses `position: fixed` (viewport coords) — any ancestor
          with `transform` would become its containing block and break the
          coords. Driven entirely by `store.contextMenu`. */}
      <ContextMenu />
      <Toast />
    </div>
  );
}

function FloatingAddSheet() {
  const addSheet = useStore((s) => s.addSheet);
  return (
    <button
      onClick={addSheet}
      title="Add a new sheet"
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pill-btn shadow-lg"
    >
      <span className="mr-1 text-[15px] leading-none">+</span> Add sheet
    </button>
  );
}
