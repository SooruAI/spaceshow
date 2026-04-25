import { Check, ChevronRight, Download, Link2, Send, X } from "lucide-react";
import { CollaboratorList } from "./CollaboratorList";
import { RoleSelect } from "./RoleSelect";
import { EMAIL_RE, type Collaborator, type Role } from "./shareTypes";

interface Props {
  emailInput: string;
  onEmailChange: (v: string) => void;
  pendingRole: Role;
  onPendingRoleChange: (r: Role) => void;
  onAdd: () => void;

  collaborators: Collaborator[];
  pendingChangeIds: Set<string>;
  onRoleChange: (id: string, role: Role) => void;
  onRemove: (id: string) => void;

  hasPendingRoleChanges: boolean;
  pendingRoleChangeCount: number;
  onApplyRoleChanges: () => void;
  onCancelRoleChanges: () => void;

  onCopyLink: () => void;
  onOpenDownload: () => void;
}

export function AccessPanel({
  emailInput,
  onEmailChange,
  pendingRole,
  onPendingRoleChange,
  onAdd,
  collaborators,
  pendingChangeIds,
  onRoleChange,
  onRemove,
  hasPendingRoleChanges,
  pendingRoleChangeCount,
  onApplyRoleChanges,
  onCancelRoleChanges,
  onCopyLink,
  onOpenDownload,
}: Props) {
  const valid = EMAIL_RE.test(emailInput.trim());

  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-ink-400 font-semibold mb-1.5 px-0.5">
          Invite people
        </div>
        <div className="flex items-stretch gap-1.5">
          <input
            type="email"
            value={emailInput}
            placeholder="email@example.com"
            spellCheck={false}
            onChange={(e) => onEmailChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && valid) onAdd();
            }}
            className="flex-1 min-w-0 h-8 px-2.5 rounded-md text-[12px] bg-ink-700 text-ink-100 placeholder-ink-400 border border-edge-subtle focus:outline-none focus:ring-2 focus:ring-brand-600/40"
          />
          <RoleSelect value={pendingRole} onChange={onPendingRoleChange} size="sm" />
          <button
            type="button"
            onClick={onAdd}
            disabled={!valid}
            className="pill-btn pill-btn-accent !h-8 !px-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
            title={valid ? "Send invite" : "Enter a valid email"}
          >
            <Send size={13} className="mr-1" />
            Send
          </button>
        </div>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wide text-ink-400 font-semibold mb-1.5 px-0.5">
          People with access
        </div>
        <CollaboratorList
          collaborators={collaborators}
          pendingChangeIds={pendingChangeIds}
          onRoleChange={onRoleChange}
          onRemove={onRemove}
        />
        {hasPendingRoleChanges && (
          <div
            role="region"
            aria-label="Unsaved role changes"
            className="mt-2 flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-brand-600/10 border border-brand-600/40 animate-fade-in"
          >
            <span className="text-[11px] text-ink-200">
              {pendingRoleChangeCount} unsaved {pendingRoleChangeCount === 1 ? "change" : "changes"}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onCancelRoleChanges}
                className="h-7 px-2 inline-flex items-center gap-1 rounded-md text-[11px] text-ink-200 hover:bg-ink-700 transition-colors"
              >
                <X size={12} />
                Cancel
              </button>
              <button
                type="button"
                onClick={onApplyRoleChanges}
                className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md bg-brand-600 hover:bg-brand-500 text-white text-[11px] font-semibold transition-colors"
              >
                <Check size={12} />
                Save changes
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-edge-subtle pt-3 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={onCopyLink}
          className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-600 hover:bg-brand-500 text-white text-[12px] font-semibold transition-colors"
        >
          <Link2 size={14} />
          Copy link &mdash; view-only
        </button>
        <button
          type="button"
          onClick={onOpenDownload}
          className="w-full h-9 inline-flex items-center justify-between px-3 rounded-md bg-ink-700 hover:bg-ink-600 text-ink-100 text-[12px] transition-colors"
        >
          <span className="inline-flex items-center gap-1.5">
            <Download size={14} />
            Download / Export
          </span>
          <ChevronRight size={14} className="text-ink-300" />
        </button>
      </div>
    </div>
  );
}
