import { useEffect, useRef, useState } from "react";
import { TopBar } from "./components/TopBar";
import { LeftSidebar } from "./components/LeftSidebar";
import { Toolbar } from "./components/Toolbar";
import { SheetToolbar } from "./components/SheetToolbar";
import { Canvas } from "./components/Canvas";
import { RightSidebar } from "./components/RightSidebar";
import { BottomBar } from "./components/BottomBar";
import { CommentsPanel } from "./components/CommentsPanel";
import { PresentMode } from "./components/PresentMode";
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
  const presenting = useStore((s) => s.presenting);
  const showSettings = useStore((s) => s.showSettings);
  const showProfile = useStore((s) => s.showProfile);
  const showShortcuts = useStore((s) => s.showShortcuts);
  const showLeftSidebar = useStore((s) => s.showLeftSidebar);
  const showRightSidebar = useStore((s) => s.showRightSidebar);
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
        <div ref={canvasWrapRef} className="flex-1 relative bg-ink-800">
          <Toolbar onUploadClick={handleUpload} />
          <Canvas width={size.w} height={size.h} />
          <SheetToolbar />
          <TextEditOverlay />
          <TextFormatBar />
          <FloatingAddSheet />
          {showComments && <CommentsPanel />}
        </div>
        {showRightSidebar && <RightSidebar />}
        {showSettings && <SettingsPanel />}
        {showProfile && <ProfilePanel />}
      </div>
      <BottomBar viewportW={size.w} viewportH={size.h} />
      {presenting && <PresentMode />}
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
