"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { ArrowRight, CornerDownLeft, type LucideIcon, Search } from "lucide-react";

import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DASHBOARD_ACTIONS, DASHBOARD_NAV } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type SearchItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  kind: "page" | "action";
  disabled: boolean;
  searchText: string;
};

type SearchGroup = { value: string; items: SearchItem[] };

// Derived from the shared navigation config — no duplicated destination list.
const SEARCH_GROUPS: SearchGroup[] = [
  {
    value: "Pages",
    items: DASHBOARD_NAV.map((item) => ({
      id: `page:${item.href}`,
      label: item.title,
      href: item.href,
      icon: item.icon,
      kind: "page",
      disabled: false,
      searchText: [item.title, ...(item.keywords ?? [])].join(" "),
    })),
  },
  {
    value: "Actions",
    items: DASHBOARD_ACTIONS.map((action) => ({
      id: `action:${action.id}`,
      label: action.title,
      href: action.href,
      icon: action.icon,
      kind: "action",
      disabled: action.availability === "planned",
      searchText: [action.title, ...(action.keywords ?? [])].join(" "),
    })),
  },
];

function subscribeNoop() {
  return () => {};
}

function useIsMac() {
  return useSyncExternalStore(
    subscribeNoop,
    () => /Mac|iPhone|iPad/.test(navigator.userAgent),
    () => false,
  );
}

export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const isMac = useIsMac();
  const hintId = useId();
  const { contains } = Autocomplete.useFilter({ sensitivity: "base" });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function select(item: SearchItem) {
    if (item.disabled) return;
    setOpen(false);
    router.push(item.href);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label="Search pages and actions"
        aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
        className="inline-flex size-9 shrink-0 items-center justify-center gap-2.5 border border-border bg-background text-sm text-muted-foreground transition-colors outline-none hover:border-foreground/25 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 sm:h-9 sm:w-56 sm:justify-start sm:px-3 md:w-72"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="hidden flex-1 truncate text-left sm:inline">Search pages & actions…</span>
        <kbd className="hidden h-5 items-center gap-0.5 border border-border bg-muted px-1.5 font-sans text-[0.625rem] font-medium text-muted-foreground sm:inline-flex">
          {isMac ? "⌘" : "Ctrl"} K
        </kbd>
      </DialogTrigger>

      <DialogContent
        position="top"
        showCloseButton={false}
        className="max-w-xl gap-0 overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">Search the dashboard</DialogTitle>

        <Autocomplete.Root
          open
          inline
          items={SEARCH_GROUPS}
          itemToStringValue={(item: SearchItem) => item.label}
          filter={(item: SearchItem, query) => contains(item.searchText, query)}
          autoHighlight="always"
          keepHighlight
        >
          <Autocomplete.InputGroup className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <Autocomplete.Input
              aria-label="Search pages and actions"
              aria-describedby={hintId}
              placeholder="Search pages and actions…"
              className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
            />
            <DialogClose className="hidden h-6 items-center border border-border bg-muted px-1.5 text-[0.625rem] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 sm:inline-flex">
              Esc
            </DialogClose>
          </Autocomplete.InputGroup>

          <div className="max-h-[min(60dvh,26rem)] overflow-y-auto overscroll-contain">
            <Autocomplete.Empty className="px-4 py-10 text-center text-sm text-muted-foreground empty:hidden">
              No pages or actions match your search.
            </Autocomplete.Empty>

            <Autocomplete.List className="p-2 data-empty:p-0">
              {(group: SearchGroup) => (
                <Autocomplete.Group key={group.value} items={group.items} className="not-last:mb-2">
                  <Autocomplete.GroupLabel className="px-2 pt-2 pb-1.5 text-[0.625rem] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
                    {group.value}
                  </Autocomplete.GroupLabel>
                  <Autocomplete.Collection>
                    {(item: SearchItem) => (
                      <SearchResult key={item.id} item={item} onSelect={select} />
                    )}
                  </Autocomplete.Collection>
                </Autocomplete.Group>
              )}
            </Autocomplete.List>
          </div>

          <div className="flex items-center gap-4 border-t border-border bg-muted/40 px-4 py-2.5 text-[0.6875rem] text-muted-foreground">
            <span id={hintId} className="sr-only">
              Use the arrow keys to move, Enter to open, and Escape to close.
            </span>
            <span className="flex items-center gap-1.5" aria-hidden>
              <kbd className="inline-flex h-5 min-w-5 items-center justify-center border border-border bg-background px-1">↑</kbd>
              <kbd className="inline-flex h-5 min-w-5 items-center justify-center border border-border bg-background px-1">↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1.5" aria-hidden>
              <kbd className="inline-flex h-5 min-w-5 items-center justify-center border border-border bg-background px-1">
                <CornerDownLeft className="size-3" />
              </kbd>
              Open
            </span>
            <span className="ml-auto flex items-center gap-1.5" aria-hidden>
              <kbd className="inline-flex h-5 items-center justify-center border border-border bg-background px-1">Esc</kbd>
              Close
            </span>
          </div>
        </Autocomplete.Root>
      </DialogContent>
    </Dialog>
  );
}

function SearchResult({ item, onSelect }: { item: SearchItem; onSelect: (item: SearchItem) => void }) {
  const Icon = item.icon;

  return (
    <Autocomplete.Item
      value={item}
      disabled={item.disabled}
      onClick={() => onSelect(item)}
      className={cn(
        "group/item flex min-h-11 cursor-default items-center gap-3 px-2 text-sm outline-none select-none scroll-my-2",
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        "data-disabled:cursor-not-allowed data-disabled:text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center border border-border bg-background",
          item.kind === "action" && !item.disabled && "border-foreground bg-foreground text-background"
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
      {item.disabled ? (
        <span className="shrink-0 border border-dashed border-border px-1.5 py-0.5 text-[0.625rem] font-medium tracking-wide text-muted-foreground uppercase">
          Planned
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          {item.kind === "page" ? "Page" : "Action"}
          <ArrowRight className="size-3 opacity-0 transition-opacity group-data-highlighted/item:opacity-100" aria-hidden />
        </span>
      )}
      {item.disabled && <span className="sr-only">Not available yet</span>}
    </Autocomplete.Item>
  );
}
