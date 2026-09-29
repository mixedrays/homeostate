import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

const STORAGE_KEY = "homeostate-devtools";

const readAll = (): Record<string, unknown> => {
  try {
    const stored: unknown = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "{}",
    );
    return stored !== null && typeof stored === "object"
      ? (stored as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

/**
 * `useState` remembered across reloads under one localStorage entry, for UI conveniences
 * such as whether the panel is open. Falls back to `initial` when storage is unavailable
 * or holds a value of another type.
 */
export function usePersistedState<T extends string | number | boolean>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const stored = readAll()[key];
    return typeof stored === typeof initial ? (stored as T) : initial;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...readAll(), [key]: value }),
      );
    } catch {
      // Storage is off or full; the value just is not remembered.
    }
  }, [key, value]);

  return [value, setValue];
}
