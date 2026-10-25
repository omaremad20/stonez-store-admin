"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical, Info, Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EntityDataTable, type ReorderRequest } from "@/components/dashboard/entities/entity-data-table";
import { EntityDeleteDialog } from "@/components/dashboard/entities/entity-delete-dialog";
import {
  EntityEmptyState,
  EntityErrorState,
  EntityTableSkeleton,
  type EmptyKind,
} from "@/components/dashboard/entities/entity-states";
import { EntityToolbar } from "@/components/dashboard/entities/entity-toolbar";
import { EntityVisibilityDialog } from "@/components/dashboard/entities/entity-visibility-dialog";
import { ENTITY_CONFIG, type EntityKey } from "@/lib/entities/config";
import { EntityRequestError, toEntityError } from "@/lib/entities/errors";
import { entityKeys, useEntityList, useEntityMutations } from "@/lib/entities/hooks";
import { DEFAULT_SORT_DIRECTION, getReorderAvailability, hasActiveFilters, type SortKey } from "@/lib/entities/query-state";
import type { EntityListItem } from "@/lib/entities/types";
import { useEntityQueryState } from "@/lib/entities/use-entity-query-state";

type DialogState = { kind: "visibility" | "delete"; item: EntityListItem } | null;

/**
 * Shared listing screen for departments, brands, categories and collections.
 * Everything entity-specific comes from `ENTITY_CONFIG`.
 */
export function EntityManagementPage({ entity }: { entity: EntityKey }) {
  const config = ENTITY_CONFIG[entity];
  const { state, update, reset, listUrl } = useEntityQueryState(config);
  const list = useEntityList(entity, state);
  const { visibility, remove, reorder } = useEntityMutations(entity);

  const [dialog, setDialog] = useState<DialogState>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const availability = getReorderAvailability(config, state);
  const reorderEnabled = availability.enabled;
  // Lock handles while a save is in flight or the list is re-syncing positions.
  const reorderLocked = reorderEnabled && (reorder.isPending || (list.isFetching && !list.isFetchingNextPage));

  /* ------------------------------------------------------------ dialogs */

  const openDialog = useCallback(
    (kind: "visibility" | "delete", item: EntityListItem) => {
      visibility.reset();
      remove.reset();
      setDialog({ kind, item });
      setDialogOpen(true);
    },
    [visibility, remove],
  );
  const onToggleVisibility = useCallback((item: EntityListItem) => openDialog("visibility", item), [openDialog]);
  const onDelete = useCallback((item: EntityListItem) => openDialog("delete", item), [openDialog]);

  /* --------------------------------------------------------- reordering */

  const onReorder = (request: ReorderRequest) => {
    if (reorder.isPending) return;
    reorder.mutate({ ...request, listKey: entityKeys.list(entity, state) });
  };

  const onSort = useCallback(
    (sort: SortKey) => {
      if (state.sort === sort) update({ dir: state.dir === "asc" ? "desc" : "asc" });
      else update({ sort, dir: DEFAULT_SORT_DIRECTION[sort] });
    },
    [state.sort, state.dir, update],
  );

  /* ------------------------------------------------------------ content */

  const items = list.items;
  const error = list.error ? toEntityError(list.error) : null;
  const isInitialLoading = list.isPending;
  const showBlockingError = list.isError && items.length === 0 && !list.isFetchNextPageError;

  let emptyKind: EmptyKind | null = null;
  if (!isInitialLoading && !list.isError && items.length === 0 && !list.isPlaceholderData) {
    emptyKind = state.q ? "no-search-results" : hasActiveFilters(state) ? "no-filter-results" : "no-records";
  }

  return (
    <div className="grid gap-4">
      <EntityToolbar
        config={config}
        state={state}
        onChange={update}
        onReset={() => reset()}
        isUpdating={list.isFetching && !list.isFetchingNextPage}
      />

      <ReorderHint
        enabled={reorderEnabled}
        reason={availability.enabled ? null : availability.reason}
        saving={reorder.isPending}
        isManual={state.sort === "manual"}
        hasRows={items.length > 1}
        onUseManual={() => update({ sort: "manual" })}
        onClearForManual={() => update({ q: "", status: "all" })}
        needsDepartment={config.departmentScope && state.department === null && state.sort === "manual" && !state.q && state.status === "all"}
      />

      {isInitialLoading ? (
        <EntityTableSkeleton columns={config.columns.length + 1} />
      ) : showBlockingError && error ? (
        <EntityErrorState
          message={error.message}
          canRetry={!(error instanceof EntityRequestError && error.isPermanent && error.code !== "conflict")}
          isRetrying={list.isFetching}
          onRetry={() => void list.refetch()}
        />
      ) : emptyKind ? (
        <EntityEmptyState
          config={config}
          kind={emptyKind}
          query={state.q}
          onClearSearch={() => update({ q: "" })}
          onClearFilters={() => update({ status: "all", department: null })}
        />
      ) : (
        <>
          <EntityDataTable
            config={config}
            items={items}
            state={state}
            listUrl={listUrl}
            reorderEnabled={reorderEnabled}
            reorderLocked={reorderLocked}
            onReorder={onReorder}
            onSort={onSort}
            onToggleVisibility={onToggleVisibility}
            onDelete={onDelete}
            dimmed={list.isPlaceholderData}
          />
          <InfiniteFooter
            plural={config.plural.toLowerCase()}
            count={items.length}
            hasNextPage={list.hasNextPage}
            isFetchingNextPage={list.isFetchingNextPage}
            isNextPageError={list.isFetchNextPageError}
            errorMessage={list.isFetchNextPageError && error ? error.message : null}
            fetchNextPage={() => void list.fetchNextPage({ cancelRefetch: false })}
            paused={list.isPlaceholderData}
          />
        </>
      )}

      <EntityVisibilityDialog
        config={config}
        item={dialog?.kind === "visibility" ? dialog.item : null}
        open={dialogOpen && dialog?.kind === "visibility"}
        isPending={visibility.isPending}
        error={visibility.error ? toEntityError(visibility.error).message : null}
        onOpenChange={setDialogOpen}
        onConfirm={(item, nextActive) =>
          visibility.mutate(
            { id: item.id, name: item.name, isActive: nextActive },
            { onSuccess: () => setDialogOpen(false) },
          )
        }
      />
      <EntityDeleteDialog
        config={config}
        item={dialog?.kind === "delete" ? dialog.item : null}
        open={dialogOpen && dialog?.kind === "delete"}
        isPending={remove.isPending}
        error={remove.error ? toEntityError(remove.error).message : null}
        onOpenChange={setDialogOpen}
        onConfirm={(item) => remove.mutate({ id: item.id, name: item.name }, { onSuccess: () => setDialogOpen(false) })}
      />
    </div>
  );
}

/* ------------------------------------------------------------ reorder hint */

export function ReorderHint({
  enabled,
  reason,
  saving,
  isManual,
  hasRows,
  needsDepartment,
  onUseManual,
  onClearForManual,
}: {
  enabled: boolean;
  reason: string | null;
  saving: boolean;
  isManual: boolean;
  hasRows: boolean;
  needsDepartment: boolean;
  onUseManual: () => void;
  onClearForManual: () => void;
}) {
  if (enabled) {
    if (!hasRows) return null;
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
        {saving ? (
          <>
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Saving the new order…
          </>
        ) : (
          <>
            <GripVertical className="size-3.5" aria-hidden />
            Drag rows by the handle to set the order customers see. Use the row menu to move a row to the very top or
            bottom. Changes save immediately.
          </>
        )}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground sm:flex-row sm:items-center">
      <Info className="hidden size-3.5 shrink-0 sm:block" aria-hidden />
      <span className="flex-1">{reason}</span>
      {!needsDepartment &&
        (isManual ? (
          <Button variant="outline" size="xs" onClick={onClearForManual}>
            <RotateCcw aria-hidden />
            Clear search &amp; visibility filter
          </Button>
        ) : (
          <Button variant="outline" size="xs" onClick={onUseManual}>
            <GripVertical aria-hidden />
            Switch to manual order
          </Button>
        ))}
    </div>
  );
}

/* --------------------------------------------------------- infinite footer */

export function InfiniteFooter({
  plural,
  count,
  hasNextPage,
  isFetchingNextPage,
  isNextPageError,
  errorMessage,
  fetchNextPage,
  paused,
}: {
  plural: string;
  count: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isNextPageError: boolean;
  errorMessage: string | null;
  fetchNextPage: () => void;
  paused: boolean;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const fetchRef = useRef(fetchNextPage);

  useEffect(() => {
    fetchRef.current = fetchNextPage;
  });

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin: "0px 0px 480px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Re-evaluated after every chunk: if the sentinel is still on screen (short
  // chunks, tall viewport) the next chunk loads without needing a scroll.
  // Never retried automatically after a failure — the user decides.
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage && !isNextPageError && !paused) {
      fetchRef.current();
    }
  }, [inView, hasNextPage, isFetchingNextPage, isNextPageError, paused, count]);

  return (
    <div ref={sentinelRef} className="flex min-h-10 items-center justify-center text-xs text-muted-foreground">
      {isFetchingNextPage ? (
        <span className="flex items-center gap-2" role="status">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Loading more {plural}…
        </span>
      ) : isNextPageError ? (
        <span role="alert" className="flex flex-col items-center gap-2 sm:flex-row">
          <span className="text-destructive">{errorMessage ?? `More ${plural} couldn't be loaded.`}</span>
          <Button variant="outline" size="xs" onClick={fetchNextPage}>
            <RotateCcw aria-hidden />
            Retry
          </Button>
        </span>
      ) : hasNextPage ? (
        <Button variant="ghost" size="xs" onClick={fetchNextPage} className="text-muted-foreground">
          Load more
        </Button>
      ) : count > 0 ? (
        <span>
          All {count} {plural} loaded
        </span>
      ) : null}
    </div>
  );
}
