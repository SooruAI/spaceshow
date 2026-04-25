import { CollaboratorRow } from "./CollaboratorRow";
import type { Collaborator, Role } from "./shareTypes";

interface Props {
  collaborators: Collaborator[];
  pendingChangeIds: Set<string>;
  onRoleChange: (id: string, role: Role) => void;
  onRemove: (id: string) => void;
}

export function CollaboratorList({ collaborators, pendingChangeIds, onRoleChange, onRemove }: Props) {
  const ownerCount = collaborators.filter((c) => c.role === "Owner").length;

  if (collaborators.length === 0) {
    return (
      <div className="px-2 py-3 text-[12px] text-ink-400 italic">
        No collaborators yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col max-h-[220px] overflow-y-auto scroll-thin -mx-1 px-1">
      {collaborators.map((c) => (
        <CollaboratorRow
          key={c.id}
          user={c}
          isOnlyOwner={c.role === "Owner" && ownerCount === 1}
          pending={pendingChangeIds.has(c.id)}
          onRoleChange={(role) => onRoleChange(c.id, role)}
          onRemove={() => onRemove(c.id)}
        />
      ))}
    </div>
  );
}
