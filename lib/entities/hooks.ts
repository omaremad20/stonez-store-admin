"use client";

import { useMemo } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  useQuery,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { ENTITY_CONFIG, type EntityKey } from "@/lib/entities/config";
import { deleteEntity, fetchEntityPage, reorderEntity, setEntityVisibility } from "@/lib/entities/client";
import { EntityRequestError, toEntityError } from "@/lib/entities/errors";
import { DEFAULT_QUERY_STATE, type EntityQueryState } from "@/lib/entities/query-state";
import type { EntityListItem, EntityListPage, ReorderInput } from "@/lib/entities/types";

type ListData = InfiniteData<EntityListPage, string | null>;

export const entityKeys = {
  all: ["entities"] as const,
  entity: (entity: EntityKey) => ["entities", entity] as const,
  lists: (entity: EntityKey) => ["entities", entity, "list"] as const,
  list: (entity: EntityKey, state: EntityQueryState) => ["entities", entity, "list", state] as const,
  /**
   * Plain (non-infinite) option lists, e.g. the department filter. Must never
   * share a key with `list`, whose cache entry has the InfiniteData shape.
   */
  options: (entity: EntityKey) => ["entities", entity, "options"] as const,
  record: (entity: EntityKey, id: string) => ["entities", entity, "record", id] as const,
};

/** Related lists that embed this entity's data and must refresh after deletes. */
const DEPENDENT_LISTS: Partial<Record<EntityKey, EntityKey[]>> = {
  departments: ["categories"],
};

/**
 * Marks every cached query of an entity stale (lists, options, records) plus
 * lists that embed its data. Active queries refetch; listings keep their URL
 * state because the state lives in the query key, not in the cache.
 */
export function invalidateEntityQueries(queryClient: QueryClient, entity: EntityKey) {
  void queryClient.invalidateQueries({ queryKey: entityKeys.entity(entity) });
  for (const related of DEPENDENT_LISTS[entity] ?? []) {
    void queryClient.invalidateQueries({ queryKey: entityKeys.entity(related) });
  }
}

/** Department options (shared by the categories filter and the category form). */
export function useDepartmentOptions() {
  return useQuery({
    queryKey: entityKeys.options("departments"),
    // The shared listing endpoint caps this at 24 rows like any listing request.
    queryFn: ({ signal }) => fetchEntityPage("departments", DEFAULT_QUERY_STATE, null, signal),
    select: (page) => ({ items: page.items ?? [], truncated: page.nextCursor !== null }),
    staleTime: 60_000,
  });
}

/* ---------------------------------------------------------------- query */

export function useEntityList(entity: EntityKey, state: EntityQueryState, options?: { enabled?: boolean }) {
  const query = useInfiniteQuery({
    queryKey: entityKeys.list(entity, state),
    queryFn: ({ pageParam, signal }) => fetchEntityPage(entity, state, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: options?.enabled ?? true,
    // Keep showing the previous result while a new search/filter loads.
    placeholderData: (previous) => previous,
    retry: (failureCount, error) =>
      !(error instanceof EntityRequestError && error.isPermanent) && failureCount < 2,
  });

  // Keyset paging should never repeat a row, but de-duplicate defensively so a
  // concurrent write between chunks can't render the same key twice.
  const items = useMemo(() => {
    const seen = new Set<string>();
    const result: EntityListItem[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const item of page.items) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          result.push(item);
        }
      }
    }
    return result;
  }, [query.data]);

  return { ...query, items };
}

/* ------------------------------------------------------------ cache utils */

function mapItems(data: ListData | undefined, fn: (items: EntityListItem[]) => EntityListItem[]): ListData | undefined {
  if (!data) return data;
  return { ...data, pages: data.pages.map((page) => ({ ...page, items: fn(page.items) })) };
}

/** Moves a row within the loaded chunks, keeping each chunk's size intact. */
export function moveLoadedItem(data: ListData, id: string, toIndex: number | "end-or-remove"): ListData {
  const flat = data.pages.flatMap((page) => page.items);
  const from = flat.findIndex((item) => item.id === id);
  if (from === -1) return data;

  const [moved] = flat.splice(from, 1);
  const lastPage = data.pages.at(-1);
  if (toIndex === "end-or-remove") {
    // Moving to the very end: only place it visibly if the whole list is loaded.
    if (!lastPage?.nextCursor) flat.push(moved);
  } else {
    flat.splice(Math.min(Math.max(toIndex, 0), flat.length), 0, moved);
  }

  let offset = 0;
  const pages = data.pages.map((page, index) => {
    const isLast = index === data.pages.length - 1;
    const size = isLast ? flat.length - offset : page.items.length;
    const items = flat.slice(offset, offset + size);
    offset += size;
    return { ...page, items };
  });
  return { ...data, pages };
}

/* ------------------------------------------------------------- mutations */

export type ReorderVariables = Omit<ReorderInput, "entity"> & {
  listKey: QueryKey;
  /** Optimistic destination in the loaded list. */
  toIndex: number | "end-or-remove";
};

export function useEntityMutations(entity: EntityKey) {
  const queryClient = useQueryClient();
  const config = ENTITY_CONFIG[entity];
  const singular = config.singular.toLowerCase();

  const invalidate = () => invalidateEntityQueries(queryClient, entity);

  const visibility = useMutation({
    mutationFn: ({ id, isActive }: { id: string; name: string; isActive: boolean }) =>
      setEntityVisibility(entity, id, isActive),
    onSuccess: (result, { id, name }) => {
      // Patch only after the database confirmed the change.
      queryClient.setQueriesData<ListData>({ queryKey: entityKeys.lists(entity) }, (data) =>
        mapItems(data, (items) =>
          items.map((item) => (item.id === id ? { ...item, isActive: result.isActive, updatedAt: result.updatedAt } : item)),
        ),
      );
      toast.success(result.isActive ? `“${name}” is now visible.` : `“${name}” is now hidden.`);
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => deleteEntity(entity, id),
    onSuccess: (result, { id, name }) => {
      queryClient.setQueriesData<ListData>({ queryKey: entityKeys.lists(entity) }, (data) =>
        mapItems(data, (items) => items.filter((item) => item.id !== id)),
      );
      if (result.warning) {
        toast.success(`“${name}” was deleted.`, {
          description: "Its image couldn't be removed from storage and will be cleaned up later.",
        });
      } else {
        toast.success(`“${name}” was deleted.`);
      }
      invalidate();
    },
  });

  const reorder = useMutation({
    // Serialise reorders for this entity so rapid drags can't interleave.
    scope: { id: `reorder:${entity}` },
    mutationFn: ({ id, targetId, position }: ReorderVariables) => reorderEntity({ entity, id, targetId, position }),
    onMutate: async ({ id, toIndex, listKey }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ListData>(listKey);
      if (previous) queryClient.setQueryData<ListData>(listKey, moveLoadedItem(previous, id, toIndex));
      return { previous, listKey };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(context.listKey, context.previous);
      toast.error("The new order wasn't saved.", { description: toEntityError(error).message });
    },
    onSuccess: () => {
      toast.success("Order saved.");
    },
    onSettled: () => {
      // Re-sync display_order values and cursors with the database.
      void queryClient.invalidateQueries({ queryKey: entityKeys.lists(entity) });
    },
  });

  return { visibility, remove, reorder, singular };
}
