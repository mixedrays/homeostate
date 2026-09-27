import { useSyncExternalStore } from "react";

/**
 * A string preference in localStorage, shared by every component that reads it and by other
 * tabs. The server snapshot is the fallback, so prerendered HTML and hydration agree, and the
 * stored value takes over right after.
 */
export function createLocalStore<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[],
) {
  const listeners = new Set<() => void>();

  function get(): T {
    try {
      const value = localStorage.getItem(key);
      return value && (allowed as readonly string[]).includes(value)
        ? (value as T)
        : fallback;
    } catch {
      return fallback;
    }
  }

  function set(value: T) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage can be unavailable (private mode); the choice then lasts for this page only.
    }
    listeners.forEach((listener) => listener());
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }

  function useValue(): [T, (value: T) => void] {
    return [useSyncExternalStore(subscribe, get, () => fallback), set];
  }

  return { get, set, subscribe, useValue };
}
