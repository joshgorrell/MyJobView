import { useEffect, useState } from "react";
function read<T>(key: string): T | null {
  try {
    return JSON.parse(sessionStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}
export function useJobDraft<T>(key: string) {
  const [state, setState] = useState<{ key: string; value: T | null }>(() => ({
    key,
    value: read<T>(key),
  }));
  const draft = state.key === key ? state.value : read<T>(key);
  useEffect(() => {
    if (state.key !== key) return;
    try {
      if (state.value) sessionStorage.setItem(key, JSON.stringify(state.value));
      else sessionStorage.removeItem(key);
    } catch {}
  }, [key, state]);
  useEffect(() => {
    if (!draft) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft]);
  return [draft, (value: T | null) => setState({ key, value })] as const;
}
