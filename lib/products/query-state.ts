import { z } from "zod";

import { SEARCH_MAX_LENGTH, STATUS_FILTERS, type SortDirection, type StatusFilter } from "@/lib/entities/query-state";

/**
 * Products listing state persisted in the URL. Shared by the client (URL ⇄ UI)
 * and the Route Handler (URL → database query), so both validate identically.
 */

/** Rows per listing request (and per infinite-scroll batch). */
export const PRODUCTS_PAGE_SIZE = 25;

export const PRODUCT_SORT_KEYS = ["manual", "name", "price", "created_at", "updated_at"] as const;
export type ProductSortKey = (typeof PRODUCT_SORT_KEYS)[number];

export const PRODUCT_SORT_LABELS: Record<ProductSortKey, string> = {
  manual: "Manual order",
  name: "Name",
  price: "Price",
  created_at: "Date created",
  updated_at: "Last updated",
};

export const PRODUCT_DEFAULT_SORT_DIRECTION: Record<ProductSortKey, SortDirection> = {
  manual: "asc",
  name: "asc",
  price: "asc",
  created_at: "desc",
  updated_at: "desc",
};

/** A related record id, or "none" for products without one. */
export type RelationFilter = string | "none";

export const RELATION_FILTER_KEYS = ["brand", "category", "collection", "department"] as const;
export type RelationFilterKey = (typeof RELATION_FILTER_KEYS)[number];

export type ProductQueryState = {
  q: string;
  status: StatusFilter;
  sort: ProductSortKey;
  dir: SortDirection;
  brand: RelationFilter | null;
  category: RelationFilter | null;
  collection: RelationFilter | null;
  /** Products are linked to a department through their category. */
  department: RelationFilter | null;
};

export const DEFAULT_PRODUCT_QUERY_STATE: ProductQueryState = {
  q: "",
  status: "all",
  sort: "manual",
  dir: "asc",
  brand: null,
  category: null,
  collection: null,
  department: null,
};

const uuidSchema = z.uuid();

type ParamSource = { get(name: string): string | null };

function parseRelation(raw: string | null): RelationFilter | null {
  if (raw === "none") return "none";
  if (raw && uuidSchema.safeParse(raw).success) return raw.toLowerCase();
  return null;
}

/** Parses untrusted URL params field by field; invalid values fall back to defaults. */
export function parseProductQueryState(params: ParamSource): ProductQueryState {
  const q = (params.get("q") ?? "").trim().slice(0, SEARCH_MAX_LENGTH);
  const status = z.enum(STATUS_FILTERS).safeParse(params.get("status"));
  const sortResult = z.enum(PRODUCT_SORT_KEYS).safeParse(params.get("sort"));
  const sort = sortResult.success ? sortResult.data : DEFAULT_PRODUCT_QUERY_STATE.sort;
  const dirResult = z.enum(["asc", "desc"]).safeParse(params.get("dir"));
  // Manual order is always ascending by display_order — it mirrors the storefront.
  const dir: SortDirection =
    sort === "manual" ? "asc" : dirResult.success ? dirResult.data : PRODUCT_DEFAULT_SORT_DIRECTION[sort];

  return {
    q,
    status: status.success ? status.data : DEFAULT_PRODUCT_QUERY_STATE.status,
    sort,
    dir,
    brand: parseRelation(params.get("brand")),
    category: parseRelation(params.get("category")),
    collection: parseRelation(params.get("collection")),
    department: parseRelation(params.get("department")),
  };
}

/** Serialises state, omitting defaults to keep URLs short and shareable. */
export function serializeProductQueryState(state: ProductQueryState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.status !== DEFAULT_PRODUCT_QUERY_STATE.status) params.set("status", state.status);
  if (state.sort !== DEFAULT_PRODUCT_QUERY_STATE.sort) params.set("sort", state.sort);
  if (state.sort !== "manual" && state.dir !== PRODUCT_DEFAULT_SORT_DIRECTION[state.sort]) params.set("dir", state.dir);
  for (const key of RELATION_FILTER_KEYS) {
    const value = state[key];
    if (value) params.set(key, value);
  }
  return params;
}

export function hasActiveProductFilters(state: ProductQueryState): boolean {
  return state.status !== "all" || RELATION_FILTER_KEYS.some((key) => state[key] !== null);
}

export type ProductReorderAvailability = { enabled: true } | { enabled: false; reason: string };

/**
 * Drag-and-drop is only offered while the visible list *is* the store-wide
 * manual order (no search, no filters). Product order is a single global
 * sequence, so a move in a filtered view could otherwise jump over rows the
 * user can't see.
 */
export function getProductReorderAvailability(state: ProductQueryState): ProductReorderAvailability {
  if (state.sort !== "manual") {
    return { enabled: false, reason: "Switch to Manual order to rearrange products." };
  }
  if (state.q || hasActiveProductFilters(state)) {
    return { enabled: false, reason: "Clear the search and all filters to rearrange products — the order is shared by the whole store." };
  }
  return { enabled: true };
}
