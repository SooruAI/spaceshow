import { useEffect, useRef } from "react";
import { X, LogOut, User, Bell, KeyRound } from "lucide-react";
import { useStore } from "../store";

export function ProfilePanel() {
  const setShowProfile = useStore((s) => s.setShowProfile);

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowProfile(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [setShowProfile]);

  return (
    <div
      ref={ref}
      className="absolute left-60 bottom-12 z-30 w-72 panel rounded-lg shadow-2xl"
      style={{ background: "var(--bg-secondary)" }}
    >
      <div className="flex items-center justify-between px-3 h-9 border-b border-ink-800">
        <div className="text-xs uppercase tracking-wider text-ink-300">
          Profile
        </div>
        <button
          className="icon-btn w-6 h-6"
          onClick={() => setShowProfile(false)}
          title="Close"
        >
          <X size={14} />
        </button>
      </div>

      <div className="p-4 flex items-center gap-3 border-b border-ink-800">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 grid place-items-center text-base font-bold text-white">
          B
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink-100 truncate">
            Brijesh Beniwal
          </div>
          <div className="text-xs text-ink-400 truncate">
            brijesh@spacesync.app
          </div>
          <div className="mt-1 inline-block text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-600/20 text-brand-500">
            Pro plan
          </div>
        </div>
      </div>

      <div className="py-1">
        <ProfileRow icon={<User size={14} />} label="Account details" />
        <ProfileRow icon={<KeyRound size={14} />} label="Security" />
        <ProfileRow icon={<Bell size={14} />} label="Notifications" />
        <div className="my-1 h-px bg-ink-800" />
        <ProfileRow icon={<LogOut size={14} />} label="Sign out" danger />
      </div>
    </div>
  );
}

function ProfileRow({
  icon,
  label,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      className={`w-full flex items-center gap-2 px-3 h-8 text-sm hover:bg-ink-700 transition-colors ${
        danger ? "text-rose-400" : "text-ink-100"
      }`}
    >
      <span className={danger ? "text-rose-400" : "text-ink-400"}>{icon}</span>
      {label}
    </button>
  );
}
