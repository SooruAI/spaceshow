import { X } from "lucide-react";
import { RoleSelect } from "./RoleSelect";
import type { Collaborator, Role } from "./shareTypes";

interface Props {
  user: Collaborator;
  isOnlyOwner: boolean;
  pending?: boolean;
  onRoleChange: (role: Role) => void;
  onRemove: () => void;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export function CollaboratorRow({ user, isOnlyOwner, pending, onRoleChange, onRemove }: Props) {
  const lockTitle = isOnlyOwner ? "A board must have at least one Owner" : undefined;
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-ink-700/60 transition-colors">
      <span
        title={user.name}
        className="rounded-full text-[10px] font-semibold text-white inline-flex items-center justify-center shrink-0"
        style={{ width: 28, height: 28, background: user.color ?? "#475569" }}
      >
        {initialsOf(user.name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium text-ink-100 truncate">{user.name}</div>
        <div className="text-[11px] text-ink-400 truncate">{user.email}</div>
      </div>
      <div className="relative inline-flex items-center">
        <RoleSelect
          value={user.role}
          onChange={onRoleChange}
          disabled={isOnlyOwner}
          title={lockTitle}
          size="sm"
        />
        {pending && (
          <span
            aria-label="Unsaved change"
            title="Unsaved change"
            className="pointer-events-none absolute -top-1 -right-1 w-2 h-2 rounded-full bg-brand-500 ring-2 ring-ink-800"
          />
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={isOnlyOwner}
        title={lockTitle ?? `Remove ${user.name}`}
        className="w-7 h-7 grid place-items-center rounded-md text-ink-400 hover:text-ink-100 hover:bg-ink-600 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-ink-400 transition-colors"
        aria-label={`Remove ${user.name}`}
      >
        <X size={14} />
      </button>
    </div>
  );
}
