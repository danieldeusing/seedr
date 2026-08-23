import { invoke, listen, type UnlistenFn } from "@/core/lib/tauriInvoke";

export const REGISTRY_CHANGED = "registry-changed";

/** Ask the host to watch `registry/` of the selected repo; idempotent. */
export const watchRegistry = (): Promise<void> => invoke<void>("watch_registry");

/**
 * Subscribe to registry changes, coalescing the burst a single save produces
 * into one callback. Returns the unsubscribe function.
 */
export async function onRegistryChanged(callback: () => void, debounceMs = 300): Promise<UnlistenFn> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unlisten = await listen(REGISTRY_CHANGED, () => {
    clearTimeout(timer);
    timer = setTimeout(callback, debounceMs);
  });
  return () => {
    clearTimeout(timer);
    unlisten();
  };
}
