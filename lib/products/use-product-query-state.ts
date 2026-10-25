"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  DEFAULT_PRODUCT_QUERY_STATE,
  PRODUCT_DEFAULT_SORT_DIRECTION,
  parseProductQueryState,
  serializeProductQueryState,
  type ProductQueryState,
} from "@/lib/products/query-state";

/**
 * URL search params are the source of truth for the products listing, so a
 * refresh, a shared link or "back" from a product restores the same view.
 * Changing any value produces a new query key, which resets infinite paging.
 */
export function useProductQueryState() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const paramsKey = searchParams.toString();
  const state = useMemo(() => parseProductQueryState(new URLSearchParams(paramsKey)), [paramsKey]);

  /** Full listing URL (path + validated params) — passed to detail/edit links. */
  const listUrl = useMemo(() => {
    const query = serializeProductQueryState(state).toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, state]);

  const update = useCallback(
    (patch: Partial<ProductQueryState>) => {
      const next: ProductQueryState = { ...state, ...patch };
      if (patch.sort && patch.dir === undefined) next.dir = PRODUCT_DEFAULT_SORT_DIRECTION[patch.sort];
      if (next.sort === "manual") next.dir = "asc";
      const query = serializeProductQueryState(next).toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, state],
  );

  const reset = useCallback(() => update({ ...DEFAULT_PRODUCT_QUERY_STATE }), [update]);

  return { state, update, reset, listUrl };
}
