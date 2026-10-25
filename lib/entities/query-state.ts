import { z } from "zod";

import type { EntityConfig } from "@/lib/entities/config";

/**
 * Listing state persisted in the URL. Shared by the client (URL ⇄ UI) and the
 * Route Handler (URL → database query), so both validate identically.
 */

/** Requested rows per chunk shown to the user. */
export const PAGE_SIZE = 24;
/** Hard ceiling for any single listing request (one extra row detects "has more"). */
export const MAX_REQUEST_ROWS = 25;
export const SEARCH_MAX_LENGTH = 64;

export const SORT_KEYS = ["manual", "name", "created_at", "updated_at"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDirection = "asc" | "desc";
export const STATUS_FILTERS = ["all", "active", "hidden"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const SORT_LABELS: Record<SortKey, string> = {
  manual: "Manual order",
  name: "Name",
  created_at: "Date created",
  updated_at: "Last updated",
};

/** Natural direction when a sort is first selected. */
export const DEFAULT_SORT_DIRECTION: Record<SortKey, SortDirection> = {
  manual: "asc",
  name: "asc",
  created_at: "desc",
  updated_at: "desc",
};

export type DepartmentFilter = string | "none";

export type EntityQueryState = {
  q: string;
  status: StatusFilter;
  sort: SortKey;
  dir: SortDirection;
  /** Categories only: a department id, or "none" for unassigned categories. */
  department: DepartmentFilter | null;
};

export const DEFAULT_QUERY_STATE: EntityQueryState = {
  q: "",
  status: "all",
  sort: "manual",
  dir: "asc",
  department: null,
};

const uuidSchema = z.uuid();

type ParamSource = { get(name: string): string | null };

/** Parses untrusted URL params field by field; invalid values fall back to defaults. */
export function parseQueryState(params: ParamSource, config: Pick<EntityConfig, "departmentScope">): EntityQueryState {
  const q = (params.get("q") ?? "").trim().slice(0, SEARCH_MAX_LENGTH);

  const statusResult = z.enum(STATUS_FILTERS).safeParse(params.get("status"));
  const sortResult = z.enum(SORT_KEYS).safeParse(params.get("sort"));
  const sort = sortResult.success ? sortResult.data : DEFAULT_QUERY_STATE.sort;

  const dirResult = z.enum(["asc", "desc"]).safeParse(params.get("dir"));
  // Manual order is always ascending by display_order — it mirrors the storefront.
  const dir: SortDirection =
    sort === "manual" ? "asc" : dirResult.success ? dirResult.data : DEFAULT_SORT_DIRECTION[sort];

  let department: DepartmentFilter | null = null;
  if (config.departmentScope) {
    const raw = params.get("department");
    if (raw === "none") department = "none";
    else if (raw && uuidSchema.safeParse(raw).success) department = raw.toLowerCase();
  }

  return {
    q,
    status: statusResult.success ? statusResult.data : DEFAULT_QUERY_STATE.status,
    sort,
    dir,
    department,
  };
}

/** Serialises state, omitting defaults to keep URLs short and shareable. */
export function serializeQueryState(state: EntityQueryState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.status !== DEFAULT_QUERY_STATE.status) params.set("status", state.status);
  if (state.sort !== DEFAULT_QUERY_STATE.sort) params.set("sort", state.sort);
  if (state.sort !== "manual" && state.dir !== DEFAULT_SORT_DIRECTION[state.sort]) params.set("dir", state.dir);
  if (state.department) params.set("department", state.department);
  return params;
}

export function hasActiveFilters(state: EntityQueryState): boolean {
  return state.status !== "all" || state.department !== null;
}

export type ReorderAvailability = { enabled: true } | { enabled: false; reason: string };

/**
 * Drag-and-drop is only offered when the visible list *is* the canonical
 * order of a complete scope, so a move can never reshuffle hidden rows.
 */
export function getReorderAvailability(
  config: Pick<EntityConfig, "departmentScope" | "plural">,
  state: EntityQueryState,
): ReorderAvailability {
  if (state.sort !== "manual") {
    return { enabled: false, reason: "Switch to Manual order to rearrange rows." };
  }
  if (state.q || state.status !== "all") {
    return { enabled: false, reason: "Clear search and the visibility filter to rearrange rows." };
  }
  if (config.departmentScope && state.department === null) {
    return {
      enabled: false,
      reason: `${config.plural} are ordered per department. Choose a department to rearrange them.`,
    };
  }
  return { enabled: true };
}
