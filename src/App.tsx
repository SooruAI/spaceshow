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
import { useStore, uid } from "./store";

export default function App() {
  const showComments = useStore((s) => s.showComments);
  const presenting = useStore((s) => s.presenting);
  const showSettings = useStore((s) => s.showSettings);
  const showProfile = useStore((s) => s.showProfile);
  const addShape = useStore((s) => s.addShape);
  const activeSheetId = useStore((s) => s.activeSheetId);

  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

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
        <LeftSidebar />
        <div ref={canvasWrapRef} className="flex-1 relative bg-ink-800">
          <Toolbar onUploadClick={handleUpload} />
          <Canvas width={size.w} height={size.h} />
          <SheetToolbar />
          {showComments && <CommentsPanel />}
        </div>
        <RightSidebar />
        {showSettings && <SettingsPanel />}
        {showProfile && <ProfilePanel />}
      </div>
      <BottomBar viewportW={size.w} viewportH={size.h} />
      {presenting && <PresentMode />}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFile}
      />
    </div>
  );
}
