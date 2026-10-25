import "server-only";

import { z } from "zod";

import { ENTITY_CONFIG, type EntityConfig, type EntityKey } from "@/lib/entities/config";
import { EntityRequestError, fromPostgresCode } from "@/lib/entities/errors";
import {
  buildCursorFilter,
  buildSearchFilter,
  combineOrGroups,
  encodeCursor,
  SORT_COLUMNS,
  type ListCursor,
} from "@/lib/entities/postgrest";
import { MAX_REQUEST_ROWS, PAGE_SIZE, type EntityQueryState } from "@/lib/entities/query-state";
import type { EntityListItem, EntityListPage } from "@/lib/entities/types";
import type { createClient } from "@/lib/supabase/server";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Rows fetched per request. One extra row beyond the page detects "has more",
 * and the total can never exceed MAX_REQUEST_ROWS (25) regardless of input.
 */
export function resolveFetchSize(requestedPageSize?: number | null): { pageSize: number; fetchSize: number } {
  const requested = Number.isFinite(requestedPageSize) ? Math.trunc(requestedPageSize as number) : PAGE_SIZE;
  const pageSize = Math.min(Math.max(requested, 1), MAX_REQUEST_ROWS - 1);
  const fetchSize = Math.min(pageSize + 1, MAX_REQUEST_ROWS);
  return { pageSize, fetchSize };
}

const BASE_COLUMNS = ["id", "name", "is_active", "display_order", "image_url", "created_at", "updated_at"];

export function selectColumns(config: EntityConfig): string {
  const columns = [...BASE_COLUMNS];
  if (config.hasSlug) columns.push("slug");
  if (config.departmentScope) columns.push("department_id", "department:departments(id,name)");
  return columns.join(",");
}

export function searchFields(config: EntityConfig): string[] {
  return config.hasSlug ? ["name", "slug"] : ["name"];
}

const rowSchema = z.object({
  id: z.string(),
  name: z.string(),
  is_active: z.boolean(),
  display_order: z.number().int().nullable(),
  image_url: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  slug: z.string().optional(),
  department: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
});

type RawRow = z.infer<typeof rowSchema>;

function toListItem(row: RawRow, config: EntityConfig): EntityListItem {
  return {
    id: row.id,
    name: row.name,
    slug: config.hasSlug ? (row.slug ?? null) : null,
    isActive: row.is_active,
    displayOrder: row.display_order,
    imageUrl: row.image_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(config.departmentScope ? { department: row.department ?? null } : {}),
  };
}

function cursorFor(row: RawRow, state: EntityQueryState): ListCursor {
  const column = SORT_COLUMNS[state.sort];
  return { s: state.sort, d: state.dir, v: row[column], id: row.id };
}

/**
 * The one listing query shared by all four entities. Filtering, sorting and
 * paging all happen in the database; RLS still applies because `supabase` is
 * the caller's session client.
 */
export async function listEntityPage(
  supabase: ServerSupabase,
  entity: EntityKey,
  state: EntityQueryState,
  cursor: ListCursor | null,
  requestedPageSize?: number | null,
): Promise<EntityListPage> {
  const config = ENTITY_CONFIG[entity];
  const { pageSize, fetchSize } = resolveFetchSize(requestedPageSize);

  let query = supabase.from(entity).select(selectColumns(config));

  if (state.status !== "all") {
    query = query.eq("is_active", state.status === "active");
  }

  if (config.departmentScope && state.department) {
    query = state.department === "none" ? query.is("department_id", null) : query.eq("department_id", state.department);
  }

  const logic = combineOrGroups([
    buildSearchFilter(searchFields(config), state.q),
    cursor ? buildCursorFilter(cursor) : null,
  ]);
  if (logic) query = query.or(logic);

  const ascending = state.dir === "asc";
  query =
    state.sort === "manual"
      ? query.order("display_order", { ascending: true, nullsFirst: false }).order("id", { ascending: true })
      : query.order(SORT_COLUMNS[state.sort], { ascending }).order("id", { ascending });

  const { data, error, status } = await query.limit(fetchSize);

  if (error) {
    throw fromPostgresCode(error.code, status);
  }

  const parsed = z.array(rowSchema).safeParse(data);
  if (!parsed.success) {
    throw new EntityRequestError("server_error", "The server returned data in an unexpected format.", 500);
  }

  const rows = parsed.data;
  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  const last = pageRows.at(-1);

  return {
    items: pageRows.map((row) => toListItem(row, config)),
    nextCursor: hasMore && last ? encodeCursor(cursorFor(last, state)) : null,
  };
}
