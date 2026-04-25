import { ChevronDown } from "lucide-react";
import { ROLES, type Role } from "./shareTypes";

interface Props {
  value: Role;
  onChange: (role: Role) => void;
  disabled?: boolean;
  title?: string;
  size?: "sm" | "md";
}

export function RoleSelect({ value, onChange, disabled, title, size = "md" }: Props) {
  const h = size === "sm" ? "h-7" : "h-8";
  return (
    <div className={`relative inline-flex items-center ${disabled ? "opacity-60" : ""}`} title={title}>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Role)}
        className={`appearance-none ${h} pl-2.5 pr-7 rounded-md text-[12px] bg-ink-700 text-ink-100 border border-edge-subtle hover:bg-ink-600 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600/40 disabled:cursor-not-allowed`}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-2 text-ink-300" />
    </div>
  );
}
