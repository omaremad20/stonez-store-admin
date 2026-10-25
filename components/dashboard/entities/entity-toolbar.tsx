"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ListFilter, Loader2, RotateCcw, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchEntityPage } from "@/lib/entities/client";
import type { EntityConfig } from "@/lib/entities/config";
import { entityKeys } from "@/lib/entities/hooks";
import {
  DEFAULT_QUERY_STATE,
  SEARCH_MAX_LENGTH,
  SORT_KEYS,
  SORT_LABELS,
  STATUS_FILTERS,
  type EntityQueryState,
  type SortKey,
  type StatusFilter,
} from "@/lib/entities/query-state";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 300;

const STATUS_LABELS: Record<StatusFilter, string> = { all: "All", active: "Visible", hidden: "Hidden" };

type Props = {
  config: EntityConfig;
  state: EntityQueryState;
  onChange: (patch: Partial<EntityQueryState>) => void;
  onReset: () => void;
  isUpdating: boolean;
};

export function EntityToolbar({ config, state, onChange, onReset, isUpdating }: Props) {
  const isDefault =
    !state.q &&
    state.status === DEFAULT_QUERY_STATE.status &&
    state.sort === DEFAULT_QUERY_STATE.sort &&
    state.department === DEFAULT_QUERY_STATE.department;

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <SearchField
        label={`Search ${config.plural.toLowerCase()}`}
        placeholder={config.hasSlug ? "Search by name or slug…" : "Search by name…"}
        value={state.q}
        onCommit={(q) => onChange({ q })}
        isUpdating={isUpdating}
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusFilterControl value={state.status} onChange={(status) => onChange({ status })} />
        {config.departmentScope && (
          <DepartmentFilter value={state.department} onChange={(department) => onChange({ department })} />
        )}
        <SortControl state={state} onChange={onChange} />
        {!isDefault && (
          <Button variant="ghost" size="sm" onClick={onReset} className="text-muted-foreground">
            <RotateCcw aria-hidden />
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- search */

function SearchField({
  label,
  placeholder,
  value,
  onCommit,
  isUpdating,
}: {
  label: string;
  placeholder: string;
  value: string;
  onCommit: (value: string) => void;
  isUpdating: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [syncedValue, setSyncedValue] = useState(value);
  const onCommitRef = useRef(onCommit);
  const id = useId();

  // The URL changed from elsewhere (Reset, back/forward): adopt it without
  // remounting the input, so focus and caret survive our own debounced commits.
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (value !== draft.trim()) setDraft(value);
  }

  useEffect(() => {
    onCommitRef.current = onCommit;
  });

  // Debounced: one URL update (and one request) after typing pauses.
  useEffect(() => {
    const next = draft.trim();
    if (next === value) return;
    const timer = window.setTimeout(() => onCommitRef.current(next), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, value]);

  return (
    <div className="relative w-full lg:max-w-xs" role="search">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        id={id}
        type="search"
        value={draft}
        maxLength={SEARCH_MAX_LENGTH}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onCommitRef.current(draft.trim());
          if (event.key === "Escape" && draft) {
            event.preventDefault();
            setDraft("");
            onCommitRef.current("");
          }
        }}
        className="pr-9 pl-9"
      />
      <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center">
        {isUpdating && value ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Searching" />
        ) : draft ? (
          <button
            type="button"
            onClick={() => {
              setDraft("");
              onCommitRef.current("");
            }}
            className="inline-flex size-6 items-center justify-center text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label="Clear search"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </span>
    </div>
  );
}

/* --------------------------------------------------------------- status */

function StatusFilterControl({ value, onChange }: { value: StatusFilter; onChange: (value: StatusFilter) => void }) {
  return (
    <div role="group" aria-label="Filter by visibility" className="inline-flex h-9 border border-border">
      {STATUS_FILTERS.map((status) => {
        const selected = value === status;
        return (
          <button
            key={status}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(status)}
            className={cn(
              "px-3 text-sm outline-none transition-colors not-last:border-r not-last:border-border focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset",
              selected ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {STATUS_LABELS[status]}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------- department */

const ALL_DEPARTMENTS = "__all__";

function DepartmentFilter({
  value,
  onChange,
}: {
  value: EntityQueryState["department"];
  onChange: (value: EntityQueryState["department"]) => void;
}) {
  // Options come from the shared listing endpoint, so they are capped like any
  // other listing request (the store has a handful of departments).
  const departments = useQuery({
    queryKey: entityKeys.list("departments", DEFAULT_QUERY_STATE),
    queryFn: ({ signal }) => fetchEntityPage("departments", DEFAULT_QUERY_STATE, null, signal),
    select: (page) => ({ items: page.items, truncated: page.nextCursor !== null }),
    staleTime: 60_000,
  });

  const items: Record<string, string> = { [ALL_DEPARTMENTS]: "All departments", none: "No department" };
  for (const department of departments.data?.items ?? []) items[department.id] = department.name;

  return (
    <Select
      items={items}
      value={value ?? ALL_DEPARTMENTS}
      onValueChange={(next) => onChange(next === ALL_DEPARTMENTS || typeof next !== "string" ? null : next)}
    >
      <SelectTrigger className="w-48" aria-label="Filter by department">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_DEPARTMENTS}>All departments</SelectItem>
        <SelectSeparator />
        {departments.isPending && (
          <SelectItem value="__loading__" disabled>
            Loading departments…
          </SelectItem>
        )}
        {departments.data?.items.map((department) => (
          <SelectItem key={department.id} value={department.id}>
            {department.name}
          </SelectItem>
        ))}
        <SelectItem value="none">No department</SelectItem>
      </SelectContent>
    </Select>
  );
}

/* ----------------------------------------------------------------- sort */

function SortControl({ state, onChange }: { state: EntityQueryState; onChange: (patch: Partial<EntityQueryState>) => void }) {
  const DirectionIcon = state.dir === "asc" ? ArrowUpNarrowWide : ArrowDownWideNarrow;

  return (
    <div className="inline-flex h-9 border border-border">
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex items-center gap-2 px-3 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset data-popup-open:bg-muted"
          aria-label={`Sort: ${SORT_LABELS[state.sort]}`}
        >
          <ListFilter className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">Sort</span>
          <span className="font-medium">{SORT_LABELS[state.sort]}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={state.sort} onValueChange={(sort: SortKey) => onChange({ sort })}>
              {SORT_KEYS.map((key) => (
                <DropdownMenuRadioItem key={key} value={key}>
                  {SORT_LABELS[key]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {state.sort !== "manual" && (
        <button
          type="button"
          onClick={() => onChange({ dir: state.dir === "asc" ? "desc" : "asc" })}
          className="inline-flex w-9 items-center justify-center border-l border-border text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
          aria-label={state.dir === "asc" ? "Ascending. Switch to descending" : "Descending. Switch to ascending"}
        >
          <DirectionIcon className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
