import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import type { User } from "../../types";

export interface MentionDropdownHandle {
  onKeyDown: (ev: KeyboardEvent) => boolean;
}

interface Props {
  items: User[];
  command: (attrs: { id: string; label: string }) => void;
}

/**
 * Arrow-nav + Enter selection list shown below the caret while the user
 * is typing an @mention. Rendered via TipTap's ReactRenderer — the outer
 * suggestion wiring handles position and mount.
 */
export const MentionDropdown = forwardRef<MentionDropdownHandle, Props>(
  function MentionDropdown({ items, command }, ref) {
    const [selected, setSelected] = useState(0);

    useEffect(() => {
      setSelected(0);
    }, [items]);

    function select(idx: number) {
      const user = items[idx];
      if (!user) return;
      command({ id: user.id, label: user.name });
    }

    useImperativeHandle(ref, () => ({
      onKeyDown: (ev: KeyboardEvent) => {
        if (ev.key === "ArrowUp") {
          setSelected((i) => (i + items.length - 1) % Math.max(items.length, 1));
          return true;
        }
        if (ev.key === "ArrowDown") {
          setSelected((i) => (i + 1) % Math.max(items.length, 1));
          return true;
        }
        if (ev.key === "Enter") {
          select(selected);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="panel rounded-md shadow-xl py-1 px-2 text-[11px] text-ink-400 w-[160px]">
          No matches
        </div>
      );
    }

    return (
      <div className="panel rounded-md shadow-xl py-1 w-[180px] max-h-56 overflow-y-auto scroll-thin">
        {items.map((u, idx) => (
          <button
            key={u.id}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              select(idx);
            }}
            onMouseEnter={() => setSelected(idx)}
            className={`w-full flex items-center gap-2 px-2 py-1 text-left text-xs ${
              idx === selected ? "row-selected" : "hover:bg-ink-700"
            }`}
          >
            <span
              className="w-5 h-5 rounded-full text-[9px] font-semibold text-white inline-flex items-center justify-center"
              style={{ background: u.color ?? "#475569" }}
            >
              {u.name
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase() ?? "")
                .join("")}
            </span>
            <span className="text-ink-100">{u.name}</span>
          </button>
        ))}
      </div>
    );
  }
);
