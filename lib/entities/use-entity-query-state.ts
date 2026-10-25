"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { EntityConfig } from "@/lib/entities/config";
import {
  DEFAULT_QUERY_STATE,
  DEFAULT_SORT_DIRECTION,
  parseQueryState,
  serializeQueryState,
  type EntityQueryState,
} from "@/lib/entities/query-state";

/**
 * URL search params are the source of truth for listing state, so a refresh,
 * a shared link or "back" from a detail page restores the same view.
 */
export function useEntityQueryState(config: EntityConfig) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const paramsKey = searchParams.toString();
  const state = useMemo(
    () => parseQueryState(new URLSearchParams(paramsKey), config),
    [paramsKey, config],
  );

  /** Full listing URL (path + validated params) — passed to detail/edit links. */
  const listUrl = useMemo(() => {
    const query = serializeQueryState(state).toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, state]);

  const update = useCallback(
    (patch: Partial<EntityQueryState>) => {
      const next: EntityQueryState = { ...state, ...patch };
      if (patch.sort && patch.dir === undefined) next.dir = DEFAULT_SORT_DIRECTION[patch.sort];
      if (next.sort === "manual") next.dir = "asc";
      const query = serializeQueryState(next).toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, state],
  );

  const reset = useCallback(
    (keep: Partial<EntityQueryState> = {}) => update({ ...DEFAULT_QUERY_STATE, ...keep }),
    [update],
  );

  return { state, update, reset, listUrl };
}
