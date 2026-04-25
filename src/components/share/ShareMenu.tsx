import { useEffect, useRef, useState, type RefObject } from "react";
import { useStore } from "../../store";
import { AccessPanel } from "./AccessPanel";
import { DownloadPanel } from "./DownloadPanel";
import {
  EMAIL_RE,
  FORMATS_BY_MODE,
  handleExport,
  type Collaborator,
  type ExportFormat,
  type ExportMode,
  type Role,
  type ShareView,
} from "./shareTypes";

interface Props {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLButtonElement | null>;
}

function seedEmail(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "")}@example.com`;
}

export function ShareMenu({ open, onClose, anchorRef }: Props) {
  const users = useStore((s) => s.users);
  const showToast = useStore((s) => s.showToast);
  const projectName = useStore((s) => s.projectName);
  const presentationName = useStore((s) => s.presentationName);

  const rootRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<ShareView>("access");
  const [emailInput, setEmailInput] = useState("");
  const [pendingRole, setPendingRole] = useState<Role>("Collaborator");
  const [collaborators, setCollaborators] = useState<Collaborator[]>(() =>
    users.map((u, i) => ({
      ...u,
      role: i === 0 ? "Owner" : "Collaborator",
      email: seedEmail(u.name),
    })),
  );
  // Pending role edits — buffered until the user clicks Save changes.
  // Keyed by collaborator id; absent key means "no pending change".
  const [roleDrafts, setRoleDrafts] = useState<Record<string, Role>>({});

  const [exportMode, setExportMode] = useState<ExportMode>("board");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("PNG");
  const [selectedSheetIds, setSelectedSheetIds] = useState<Set<string>>(new Set());

  // Reset to the access view whenever the popover reopens, so the user
  // never lands inside the Download sub-view by surprise.
  useEffect(() => {
    if (open) setView("access");
  }, [open]);

  // Outside-click + Escape dismissal. Mirrors ColorDropdown's pattern:
  // listeners only attached while open, and Escape returns focus to the
  // anchor button.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        anchorRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  function addCollaborator() {
    const email = emailInput.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return;
    if (collaborators.some((c) => c.email.toLowerCase() === email)) {
      showToast("Already a collaborator", "info");
      return;
    }
    const name = email.split("@")[0].replace(/[._]+/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
    const next: Collaborator = {
      id: `invite-${Date.now()}`,
      name,
      avatarUrl: "",
      color: pickColor(collaborators.length),
      role: pendingRole,
      email,
    };
    setCollaborators((prev) => [...prev, next]);
    setEmailInput("");
    showToast(`Invited ${email} as ${pendingRole}`, "info");
  }

  // Display-time merge: row UI shows draft role if one is pending,
  // otherwise the committed role.
  const displayedCollaborators: Collaborator[] = collaborators.map((c) => ({
    ...c,
    role: roleDrafts[c.id] ?? c.role,
  }));
  const pendingChangeIds = new Set(Object.keys(roleDrafts));
  const hasPendingRoleChanges = pendingChangeIds.size > 0;

  function updateRole(id: string, role: Role) {
    const original = collaborators.find((c) => c.id === id);
    if (!original) return;

    // Validate against the *displayed* (draft-merged) view so a user can
    // promote someone else first, then demote the current sole owner.
    if (original.role === "Owner" || roleDrafts[id] === "Owner") {
      const ownerCountAfter = displayedCollaborators.reduce((n, c) => {
        const next = c.id === id ? role : c.role;
        return next === "Owner" ? n + 1 : n;
      }, 0);
      if (ownerCountAfter === 0) {
        showToast("A board must have at least one Owner", "error");
        return;
      }
    }

    setRoleDrafts((prev) => {
      const next = { ...prev };
      // Drop the override when it equals the committed value — keeps the
      // "pending changes" set tight so Save/Cancel only appear for real diffs.
      if (role === original.role) delete next[id];
      else next[id] = role;
      return next;
    });
  }

  function applyRoleChanges() {
    if (!hasPendingRoleChanges) return;
    const count = pendingChangeIds.size;
    setCollaborators((prev) =>
      prev.map((c) => (roleDrafts[c.id] ? { ...c, role: roleDrafts[c.id] } : c)),
    );
    setRoleDrafts({});
    showToast(`Saved ${count} role change${count === 1 ? "" : "s"}`, "info");
  }

  function cancelRoleChanges() {
    if (!hasPendingRoleChanges) return;
    setRoleDrafts({});
  }

  function removeCollaborator(id: string) {
    const target = collaborators.find((c) => c.id === id);
    if (!target) return;
    // Block removal of the only Owner — measured against the current
    // committed list, since drafts are buffered and not yet applied.
    const ownerCount = collaborators.filter((c) => c.role === "Owner").length;
    if (target.role === "Owner" && ownerCount === 1) {
      showToast("A board must have at least one Owner", "error");
      return;
    }
    setCollaborators((prev) => prev.filter((c) => c.id !== id));
    // Drop any pending draft for the removed user.
    setRoleDrafts((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}?view=1`;
    navigator.clipboard
      .writeText(url)
      .then(() => showToast("Link copied — view-only access", "info"))
      .catch(() => showToast("Couldn't copy link", "error"));
  }

  function switchMode(next: ExportMode) {
    setExportMode(next);
    if (!FORMATS_BY_MODE[next].includes(exportFormat)) {
      setExportFormat(FORMATS_BY_MODE[next][0]);
    }
  }

  function toggleSheet(id: string) {
    setSelectedSheetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function downloadNow() {
    const ids = exportMode === "slides" ? [...selectedSheetIds] : [];
    handleExport(exportMode, exportFormat, ids, { showToast });
  }

  const title = view === "access" ? `Share "${presentationName}"` : projectName;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Share menu"
      className="absolute right-0 top-full mt-1.5 z-50 panel rounded-lg shadow-pop animate-fade-scale-in w-[340px] overflow-hidden"
    >
      <div className="px-3 py-2 border-b border-edge-subtle flex items-center justify-between">
        <div className="text-[12px] font-semibold text-ink-100 truncate" title={title}>
          {title}
        </div>
        <div className="text-[10px] text-ink-400">{view === "access" ? "Access" : "Export"}</div>
      </div>

      {view === "access" ? (
        <AccessPanel
          emailInput={emailInput}
          onEmailChange={setEmailInput}
          pendingRole={pendingRole}
          onPendingRoleChange={setPendingRole}
          onAdd={addCollaborator}
          collaborators={displayedCollaborators}
          pendingChangeIds={pendingChangeIds}
          onRoleChange={updateRole}
          onRemove={removeCollaborator}
          hasPendingRoleChanges={hasPendingRoleChanges}
          pendingRoleChangeCount={pendingChangeIds.size}
          onApplyRoleChanges={applyRoleChanges}
          onCancelRoleChanges={cancelRoleChanges}
          onCopyLink={copyLink}
          onOpenDownload={() => setView("download")}
        />
      ) : (
        <DownloadPanel
          mode={exportMode}
          format={exportFormat}
          selectedSheetIds={selectedSheetIds}
          onModeChange={switchMode}
          onFormatChange={setExportFormat}
          onToggleSheet={toggleSheet}
          onSelectIds={(ids) =>
            setSelectedSheetIds((prev) => {
              const next = new Set(prev);
              ids.forEach((id) => next.add(id));
              return next;
            })
          }
          onDeselectIds={(ids) =>
            setSelectedSheetIds((prev) => {
              const next = new Set(prev);
              ids.forEach((id) => next.delete(id));
              return next;
            })
          }
          onDownload={downloadNow}
          onBack={() => setView("access")}
        />
      )}
    </div>
  );
}

const PALETTE = ["#f97316", "#eab308", "#22c55e", "#06b6d4", "#6366f1", "#ec4899"];
function pickColor(i: number): string {
  return PALETTE[i % PALETTE.length];
}
