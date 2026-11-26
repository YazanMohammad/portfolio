import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Guard = {
  dirty: boolean;
  setDirty: (id: string, dirty: boolean) => void;
  /** Runs `action` now when clean; otherwise asks first. */
  run: (action: () => void) => void;
};

const GuardContext = createContext<Guard | null>(null);

export function UnsavedProvider({ children }: { children: ReactNode }) {
  const ids = useRef(new Set<string>());
  const [dirtyCount, setDirtyCount] = useState(0);
  const [pending, setPending] = useState<(() => void) | null>(null);

  const setDirty = useCallback((id: string, dirty: boolean) => {
    if (dirty) ids.current.add(id);
    else ids.current.delete(id);
    setDirtyCount(ids.current.size);
  }, []);

  const run = useCallback((action: () => void) => {
    if (ids.current.size === 0) action();
    else setPending(() => action);
  }, []);

  useEffect(() => {
    if (dirtyCount === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirtyCount]);

  const value = useMemo(() => ({ setDirty, run, dirty: dirtyCount > 0 }), [setDirty, run, dirtyCount]);

  return (
    <GuardContext.Provider value={value}>
      {children}
      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You have unsaved changes.</AlertDialogTitle>
            <AlertDialogDescription>If you leave now, they will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const action = pending;
                setPending(null);
                action?.();
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </GuardContext.Provider>
  );
}

export function usePageDirty() { return useContext(GuardContext)?.dirty ?? false; }

/** Registers a form as dirty while `dirty` is true. */
export function useUnsavedGuard(id: string, dirty: boolean): void {
  const guard = useContext(GuardContext);
  const setDirty = guard?.setDirty;
  useEffect(() => {
    if (!setDirty) return;
    setDirty(id, dirty);
    return () => setDirty(id, false);
  }, [setDirty, id, dirty]);
}

/** Runs an action (log out, close) only after the user confirms when forms are dirty. */
export function useGuardedAction(): (action: () => void) => void {
  const guard = useContext(GuardContext);
  return guard ? guard.run : (action) => action();
}

export function useGuardedNavigate(): (to: string) => void {
  const [, navigate] = useLocation();
  const guarded = useGuardedAction();
  return useCallback((to: string) => guarded(() => navigate(to)), [guarded, navigate]);
}

export function useSaveShortcut(onSave: () => void, enabled: boolean): void {
  const latest = useRef(onSave);
  latest.current = onSave;
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        latest.current();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

type GuardedLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { to: string };

export function GuardedLink({ to, onClick, children, ...rest }: GuardedLinkProps) {
  const go = useGuardedNavigate();
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === "_blank") return;
    e.preventDefault();
    go(to);
  };
  return (
    <a {...rest} href={to} onClick={handle}>
      {children}
    </a>
  );
}
