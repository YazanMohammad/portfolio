import { useSyncExternalStore } from "react";

/** User-controlled pause for the marquee and hero art (WCAG 2.2.2). */
let paused = false;
const listeners = new Set<() => void>();
export function setMotionPaused(next: boolean) { paused = next; listeners.forEach(l => l()); }
export function useMotionPaused() {
  return useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => paused, () => false);
}
