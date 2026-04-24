import { useEffect, useRef, useState } from "react";
import { Sun, Moon, X, Grid3x3, Square, MoreHorizontal } from "lucide-react";
import { useStore } from "../store";
import { applyTheme, getStoredTheme, type ThemeMode } from "../theme";
import type { GridMode } from "../store";

export function SettingsPanel() {
  const setShowSettings = useStore((s) => s.setShowSettings);
  const showRulerH = useStore((s) => s.showRulerH);
  const showRulerV = useStore((s) => s.showRulerV);
  const setShowRulerH = useStore((s) => s.setShowRulerH);
  const setShowRulerV = useStore((s) => s.setShowRulerV);
  const setShowRulerBoth = useStore((s) => s.setShowRulerBoth);
  const gridMode = useStore((s) => s.gridMode);
  const setGridMode = useStore((s) => s.setGridMode);
  const gridGap = useStore((s) => s.gridGap);
  const setGridGap = useStore((s) => s.setGridGap);

  const [mode, setMode] = useState<ThemeMode>(() => getStoredTheme());
  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [setShowSettings]);

  const showScale = showRulerH || showRulerV;

  const gridOptions: { id: GridMode; label: string; icon: React.ReactNode }[] = [
    { id: "plain", label: "Plain", icon: <Square size={14} /> },
    { id: "dots", label: "Dotted grid", icon: <MoreHorizontal size={14} /> },
    { id: "lines", label: "Grid lines", icon: <Grid3x3 size={14} /> },
  ];

  return (
    <div
      ref={ref}
      className="fixed left-2 bottom-11 z-30 w-80 panel rounded-lg shadow-2xl"
      style={{ background: "var(--bg-secondary)" }}
    >
      <div className="flex items-center justify-between px-3 h-9 border-b border-ink-800">
        <div className="text-xs uppercase tracking-wider text-ink-300">
          Settings
        </div>
        <button
          className="icon-btn w-6 h-6"
          onClick={() => setShowSettings(false)}
          title="Close"
        >
          <X size={14} />
        </button>
      </div>

      <div className="p-3 space-y-4">
        {/* Theme */}
        <Section title="Appearance">
          <div className="flex items-center gap-1 p-1 rounded-md surface-2">
            <ThemeChip
              active={mode === "light"}
              onClick={() => setMode("light")}
              icon={<Sun size={13} />}
              label="Light"
            />
            <ThemeChip
              active={mode === "dark"}
              onClick={() => setMode("dark")}
              icon={<Moon size={13} />}
              label="Dark"
            />
          </div>
        </Section>

        {/* Scale */}
        <Section title="Scale (rulers)">
          <Row
            label="Show scale"
            checked={showScale}
            onChange={(v) => setShowRulerBoth(v)}
          />
          <div className="pl-3 border-l border-ink-700 ml-1 space-y-1">
            <Row
              label="Horizontal scale"
              checked={showRulerH}
              onChange={(v) => setShowRulerH(v)}
              compact
            />
            <Row
              label="Vertical scale"
              checked={showRulerV}
              onChange={(v) => setShowRulerV(v)}
              compact
            />
          </div>
        </Section>

        {/* Canvas */}
        <Section title="Canvas">
          <div className="grid grid-cols-3 gap-1.5">
            {gridOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setGridMode(opt.id)}
                className={`flex flex-col items-center justify-center gap-1 h-14 rounded-md text-[11px] transition-colors ${
                  gridMode === opt.id
                    ? "row-selected ring-1 ring-brand-600"
                    : "surface-2 hover:bg-ink-700 text-ink-200"
                }`}
              >
                {opt.icon}
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
          {gridMode !== "plain" && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-ink-300">Grid gap</span>
                <span className="text-xs text-ink-200 tabular-nums">
                  {gridGap}px
                </span>
              </div>
              <input
                type="range"
                min={20}
                max={200}
                step={5}
                value={gridGap}
                onChange={(e) => setGridGap(Number(e.target.value))}
                className="w-full accent-brand-500"
              />
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1.5">
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({
  label,
  checked,
  onChange,
  compact,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  compact?: boolean;
}) {
  return (
    <label
      className={`flex items-center justify-between cursor-pointer ${
        compact ? "h-7 text-xs" : "h-8 text-sm"
      }`}
    >
      <span className="text-ink-100">{label}</span>
      <Switch checked={checked} onChange={onChange} />
    </label>
  );
}

function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex w-9 h-5 rounded-full transition-colors ${
        checked ? "bg-brand-600" : "bg-ink-700"
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function ThemeChip({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 h-7 rounded text-xs transition-colors ${
        active
          ? "bg-brand-600 text-white"
          : "text-ink-200 hover:bg-ink-700"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
