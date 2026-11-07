/** Namespaced JSON localStorage that never throws (private mode, quota, disabled storage). */
export function createStore<T>(key: string, fallback: () => T) {
  return {
    load(): T {
      try {
        const raw = localStorage.getItem(key)
        return raw ? { ...fallback(), ...(JSON.parse(raw) as T) } : fallback()
      } catch {
        return fallback()
      }
    },
    save(value: T): void {
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch {
        /* storage unavailable: play on without persistence */
      }
    },
  }
}
