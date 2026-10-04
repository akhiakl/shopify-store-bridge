import { useCallback, useState } from "react";

/** Checkbox selection for a group sync page: the set of selection keys
 * plus a toggle that adds or removes several keys at once (a "select all"
 * row passes every key in its list). */
export function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleKeys = useCallback((keys: string[], select: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      for (const key of keys) {
        if (select) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }, []);

  return { selected, toggleKeys };
}
