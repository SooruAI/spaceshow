import { useEffect, useRef, useState } from "react";
import { PanelLeftOpen, PanelRightOpen } from "lucide-react";
import { TopBar } from "./components/TopBar";
import { LeftSidebar } from "./components/LeftSidebar";
import { Toolbar } from "./components/Toolbar";
import { LineToolMenu } from "./components/LineToolMenu";
import { SheetToolbar } from "./components/SheetToolbar";
import { Canvas } from "./components/Canvas";
import { RightSidebar } from "./components/RightSidebar";
import { BottomBar } from "./components/BottomBar";
import { CommentsSidebar } from "./components/comments/CommentsSidebar";
import { SpacePresent } from "./components/SpacePresent";
import { SettingsPanel } from "./components/SettingsPanel";
import { ProfilePanel } from "./components/ProfilePanel";
import { ShortcutsCheatsheet } from "./components/ShortcutsCheatsheet";
import { TextEditOverlay } from "./components/TextEditOverlay";
import { TextFormatBar } from "./components/TextFormatBar";
import { useStore, uid } from "./store";
import { useShortcuts } from "./hooks/useShortcuts";
import type { Shape } from "./types";

export default function App() {
  const showComments = useStore((s) => s.showComments);
  const presentationStatus = useStore((s) => s.presentationStatus);
  const showSettings = useStore((s) => s.showSettings);
  const showProfile = useStore((s) => s.showProfile);
  const showShortcuts = useStore((s) => s.showShortcuts);
  const showLeftSidebar = useStore((s) => s.showLeftSidebar);
  const setShowLeftSidebar = useStore((s) => s.setShowLeftSidebar);
  const showRightSidebar = useStore((s) => s.showRightSidebar);
  const openRightPanel = useStore((s) => s.openRightPanel);
  const addShape = useStore((s) => s.addShape);
  const activeSheetId = useStore((s) => s.activeSheetId);

  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageFillRef = useRef<HTMLInputElement>(null);
  const imageFillTargetRef = useRef<string | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  // Global keyboard shortcuts — single source of truth; guards built in.
  useShortcuts();

  useEffect(() => {
    function measure() {
      if (!canvasWrapRef.current) return;
      const rect = canvasWrapRef.current.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
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
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const max = 480;
        const ratio = img.width / img.height;
        const w = ratio > 1 ? max : max * ratio;
        const h = ratio > 1 ? max / ratio : max;
        addShape({
          id: uid("shape"),
          type: "image",
          sheetId: activeSheetId,
          name: file.name,
          visible: true,
          locked: false,
          x: 80,
          y: 80,
          width: w,
          height: h,
          src,
        });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
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
          <Canvas width={size.w} height={size.h} />
          <SheetToolbar />
          <TextEditOverlay />
          <TextFormatBar />
          <FloatingAddSheet />
        </div>
        {showComments && <CommentsSidebar />}
        {showRightSidebar && !showComments && <RightSidebar />}
        {/* Mirror of the left-side expand affordance — same style, anchored
            to the right edge so the pattern is symmetric. Only renders when
            the right rail is fully collapsed; while Comments is docked, the
            swap-to-views affordance lives inside the Comments header so it
            doesn't float over the sidebar and silently no-op. Matches the
            left expand button's vertical offset so both sit below the ruler. */}
        {!showRightSidebar && !showComments && (
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
        accept="image/*"
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
