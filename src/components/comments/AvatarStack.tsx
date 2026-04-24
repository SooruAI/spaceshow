import { useStore } from "../../store";

interface Props {
  userIds: string[];
  max?: number;
  size?: number;
}

/**
 * Overlapping avatars for a thread row. Renders up to `max` circles,
 * collapses the remainder into a "+N" badge. Initials are derived from
 * the user's display name; `user.color` tints the background.
 */
export function AvatarStack({ userIds, max = 3, size = 20 }: Props) {
  const users = useStore((s) => s.users);
  const deduped: string[] = [];
  for (const id of userIds) if (!deduped.includes(id)) deduped.push(id);

  const visible = deduped.slice(0, max);
  const overflow = deduped.length - visible.length;
  const overlap = Math.round(size * 0.35);

  return (
    <div className="flex items-center">
      {visible.map((id, idx) => {
        const u = users.find((x) => x.id === id);
        const initials = u
          ? u.name
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w[0]?.toUpperCase() ?? "")
              .join("")
          : "?";
        return (
          <span
            key={id}
            title={u?.name ?? id}
            className="rounded-full text-[10px] font-semibold text-white ring-2 ring-ink-900 inline-flex items-center justify-center"
            style={{
              width: size,
              height: size,
              background: u?.color ?? "#475569",
              marginLeft: idx === 0 ? 0 : -overlap,
            }}
          >
            {initials}
          </span>
        );
      })}
      {overflow > 0 && (
        <span
          className="rounded-full text-[10px] font-semibold text-ink-100 ring-2 ring-ink-900 inline-flex items-center justify-center bg-ink-600"
          style={{ width: size, height: size, marginLeft: -overlap }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
