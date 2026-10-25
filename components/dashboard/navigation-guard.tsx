"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Unsaved-changes protection for the dashboard.
 *
 * A page registers a blocker while it has unsaved work. The provider then:
 *  - intercepts clicks on internal links in the capture phase (sidebar, logo,
 *    row menus, Cancel, breadcrumbs…). Next's <Link> skips navigation when the
 *    click is `defaultPrevented`, so no router or history patching is needed;
 *  - exposes `navigate()` for programmatic navigation (command palette);
 *  - warns on refresh / tab close / external navigation via `beforeunload`
 *    (browser-controlled dialog).
 *
 * Known limit: the browser Back/Forward buttons can't be intercepted in the
 * App Router without patching history; the form keeps beforeunload for full
 * page unloads only.
 */

type BlockerMessage = { title: string; description: string };

type Blocker = {
  shouldBlock: () => boolean;
  message: () => BlockerMessage;
  /** Called when the user confirms "Discard changes", before navigating. */
  onDiscard?: () => void;
};

type GuardContext = {
  /** Registers the active blocker; returns an unregister function. */
  register: (blocker: Blocker) => () => void;
  /** Navigate in-app, asking first if unsaved work would be lost. */
  navigate: (href: string) => void;
  /** Lets the next navigation through (e.g. right after a successful save). */
  release: () => void;
};

const NavigationGuardContext = createContext<GuardContext | null>(null);

const DEFAULT_MESSAGE: BlockerMessage = {
  title: "Discard unsaved changes?",
  description: "This form has changes that haven't been saved. If you leave now, they will be lost.",
};

function isPlainLeftClick(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const blockerRef = useRef<Blocker | null>(null);
  const releasedRef = useRef(false);
  const [pending, setPending] = useState<{ href: string; message: BlockerMessage } | null>(null);

  const isBlocking = useCallback(() => !releasedRef.current && (blockerRef.current?.shouldBlock() ?? false), []);

  const register = useCallback((blocker: Blocker) => {
    blockerRef.current = blocker;
    releasedRef.current = false;
    return () => {
      if (blockerRef.current === blocker) blockerRef.current = null;
    };
  }, []);

  const release = useCallback(() => {
    releasedRef.current = true;
  }, []);

  const requestNavigation = useCallback(
    (href: string) => {
      if (isBlocking()) {
        setPending({ href, message: blockerRef.current?.message() ?? DEFAULT_MESSAGE });
        return;
      }
      router.push(href);
    },
    [isBlocking, router],
  );

  // Capture phase runs before React's handlers on the root, so the click is
  // marked defaultPrevented before <Link> decides whether to navigate. Other
  // onClick handlers (e.g. closing the mobile sheet) still run.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || !isPlainLeftClick(event) || !isBlocking()) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return; // full unload → beforeunload handles it
      const here = window.location;
      if (url.pathname === here.pathname && url.search === here.search) return; // same page / hash link

      event.preventDefault();
      requestNavigation(`${url.pathname}${url.search}${url.hash}`);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [isBlocking, requestNavigation]);

  const value = useMemo<GuardContext>(() => ({ register, navigate: requestNavigation, release }), [register, requestNavigation, release]);

  function discard() {
    if (!pending) return;
    const { href } = pending;
    setPending(null);
    blockerRef.current?.onDiscard?.();
    releasedRef.current = true; // exactly one navigation, never re-blocked
    router.push(href);
  }

  return (
    <NavigationGuardContext value={value}>
      {children}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null); // Cancel / Escape: stay, keep every value
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.message.title ?? DEFAULT_MESSAGE.title}</AlertDialogTitle>
            <AlertDialogDescription>{pending?.message.description ?? DEFAULT_MESSAGE.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
            <Button
              className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/30"
              onClick={discard}
            >
              Discard changes
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </NavigationGuardContext>
  );
}

/** Navigation that respects unsaved-changes protection (falls back to router.push). */
export function useGuardedNavigation() {
  const guard = useContext(NavigationGuardContext);
  const router = useRouter();
  return {
    navigate: guard?.navigate ?? ((href: string) => router.push(href)),
    release: guard?.release ?? (() => {}),
  };
}

/**
 * Protects a page while `when` is true: in-app navigation asks first, and the
 * browser warns on refresh / tab close. Listeners are removed as soon as the
 * page is clean or unmounts.
 */
export function useUnsavedChangesGuard({
  when,
  message,
  onDiscard,
}: {
  when: boolean;
  message?: () => BlockerMessage;
  onDiscard?: () => void;
}) {
  const guard = useContext(NavigationGuardContext);
  const whenRef = useRef(when);
  const messageRef = useRef(message);
  const onDiscardRef = useRef(onDiscard);

  useEffect(() => {
    whenRef.current = when;
    messageRef.current = message;
    onDiscardRef.current = onDiscard;
  });

  useEffect(() => {
    if (!guard) return;
    return guard.register({
      shouldBlock: () => whenRef.current,
      message: () => messageRef.current?.() ?? DEFAULT_MESSAGE,
      onDiscard: () => onDiscardRef.current?.(),
    });
  }, [guard]);

  useEffect(() => {
    if (!when) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!whenRef.current) return;
      event.preventDefault();
      // Legacy browsers need returnValue set; the text itself is browser-controlled.
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [when]);
}
