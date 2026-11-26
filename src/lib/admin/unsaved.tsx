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
  registerSaver: (entry: { fn: () => void; enabled: boolean } | null) => void;
};

/** Plain Ctrl/Cmd+S only: Alt (AltGr, VoiceOver) and Shift variants are left alone. */
function isPlainSave(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "s";
}

const GuardContext = createContext<Guard | null>(null);

export function UnsavedProvider({ children }: { children: ReactNode }) {
  const ids = useRef(new Set<string>());
  const [dirtyCount, setDirtyCount] = useState(0);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const pendingRef = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const saver = useRef<{ fn: () => void; enabled: boolean } | null>(null);
  const [status, setStatus] = useState("");
  const statusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const setDirty = useCallback((id: string, dirty: boolean) => {
    if (dirty) ids.current.add(id);
    else ids.current.delete(id);
    setDirtyCount(ids.current.size);
  }, []);

  const run = useCallback((action: () => void) => {
    if (ids.current.size === 0) action();
    else {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPending(() => action);
    }
  }, []);

  const registerSaver = useCallback((entry: { fn: () => void; enabled: boolean } | null) => {
    saver.current = entry;
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isPlainSave(e)) return;
      e.preventDefault();
      const s = saver.current;
      if (s?.enabled) {
        s.fn();
        return;
      }
      setStatus("Nothing to save");
      clearTimeout(statusTimer.current);
      statusTimer.current = setTimeout(() => setStatus(""), 2500);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      clearTimeout(statusTimer.current);
    };
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

  pendingRef.current = pending !== null;

  const value = useMemo(() => ({ setDirty, run, registerSaver, dirty: dirtyCount > 0 }), [setDirty, run, registerSaver, dirtyCount]);

  return (
    <GuardContext.Provider value={value}>
      {children}
      <p aria-live="polite" className="admin-shortcut-status">{status}</p>
      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            const el = opener.current;
            opener.current = null;
            (el && el.isConnected ? el : document.getElementById("main"))?.focus();
          }}
        >
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

/**
 * Registers the page's save action. Inside the provider one global handler always swallows plain
 * Ctrl/Cmd+S (no browser Save dialog) and runs `onSave` only when `enabled`; otherwise it says "Nothing to save".
 */
export function useSaveShortcut(onSave: () => void, enabled: boolean): void {
  const guard = useContext(GuardContext);
  const register = guard?.registerSaver;
  const latest = useRef(onSave);
  latest.current = onSave;
  useEffect(() => {
    if (register) {
      register({ fn: () => latest.current(), enabled });
      return () => register(null);
    }
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isPlainSave(e)) {
        e.preventDefault();
        latest.current();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [register, enabled]);
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
