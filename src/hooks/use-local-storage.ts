import React from "react";

/**
 * useState + localStorage: init với default, load localStorage sau mount,
 * tự persist mỗi khi set. An toàn với SSR (localStorage chỉ đọc ở client).
 */
export function useLocalStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = React.useState<T>(defaultValue);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = React.useCallback(
    (action: React.SetStateAction<T>) => {
      setValue((prev) => {
        const next = typeof action === "function" ? (action as (p: T) => T)(prev) : action;
        try { window.localStorage.setItem(key, JSON.stringify(next)); } catch {}
        return next;
      });
    },
    [key],
  );

  return [value, persist] as const;
}
