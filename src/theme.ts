import { useEffect, useState } from "react";

export type ThemeMode = "dark" | "light";

const VAR_NAMES = [
  "--bg-primary",
  "--bg-secondary",
  "--bg-tertiary",
  "--bg-hover",
  "--bg-active",
  "--border",
  "--border-subtle",
  "--text-primary",
  "--text-secondary",
  "--text-muted",
  "--accent",
  "--accent-hover",
  "--accent-strong",
  "--canvas-bg-1",
  "--canvas-bg-2",
  "--grid-dot",
] as const;

export type ThemeVars = Record<(typeof VAR_NAMES)[number], string>;

function readVars(): ThemeVars {
  const cs = getComputedStyle(document.documentElement);
  const out: any = {};
  for (const n of VAR_NAMES) out[n] = cs.getPropertyValue(n).trim() || "#000";
  return out;
}

export function useThemeVars(): ThemeVars {
  const [vars, setVars] = useState<ThemeVars>(() =>
    typeof window === "undefined"
      ? ({} as ThemeVars)
      : readVars()
  );
  useEffect(() => {
    setVars(readVars());
    const obs = new MutationObserver(() => setVars(readVars()));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);
  return vars;
}

export function getStoredTheme(): ThemeMode {
  const v = (typeof localStorage !== "undefined" &&
    localStorage.getItem("spaceshow-theme")) as ThemeMode | null;
  return v === "light" ? "light" : "dark";
}

export function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode);
  try {
    localStorage.setItem("spaceshow-theme", mode);
  } catch {}
}
