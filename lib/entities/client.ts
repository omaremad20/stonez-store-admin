"use client";

import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";

import { ENTITY_CONFIG, type EntityDependent, type EntityKey } from "@/lib/entities/config";
import { ENTITY_ERROR_MESSAGES, EntityRequestError, fromPostgresCode, toEntityError } from "@/lib/entities/errors";
import { serializeQueryState, type EntityQueryState } from "@/lib/entities/query-state";
import type { EntityApiErrorBody, EntityListPage, ReorderInput } from "@/lib/entities/types";
import { createClient } from "@/lib/supabase/client";

/* --------------------------------------------------------------- listing */

export async function fetchEntityPage(
  entity: EntityKey,
  state: EntityQueryState,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<EntityListPage> {
  const params = serializeQueryState(state);
  if (cursor) params.set("cursor", cursor);

  let response: Response;
  try {
    response = await fetch(`/api/entities/${entity}?${params.toString()}`, {
      signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    throw toEntityError(error);
  }

  if (!response.ok) {
    let body: Partial<EntityApiErrorBody> | null = null;
    try {
      body = (await response.json()) as Partial<EntityApiErrorBody>;
    } catch {
      // Non-JSON error page; fall through to the generic message.
    }
    const code = body?.error?.code ?? (response.status >= 500 ? "server_error" : "bad_request");
    throw new EntityRequestError(code, body?.error?.message ?? ENTITY_ERROR_MESSAGES[code], response.status);
  }

  return (await response.json()) as EntityListPage;
}

/* ------------------------------------------------------------- mutations */
// Mutations run with the signed-in user's session. Authorization is enforced by
// RLS (admin-only UPDATE), the `reorder_catalog_entity` RPC's is_admin() check,
// and the delete Edge Functions' is_admin() check — never by the UI.

export async function setEntityVisibility(entity: EntityKey, id: string, isActive: boolean) {
  const { data, error, status } = await createClient()
    .from(entity)
    .update({ is_active: isActive })
    .eq("id", id)
    .select("id,is_active,updated_at");

  if (error) throw fromPostgresCode(error.code, status);
  // RLS filters rows the caller may not update, so "0 rows" means forbidden or gone.
  if (!data || data.length === 0) {
    throw new EntityRequestError(
      "not_found",
      `This ${ENTITY_CONFIG[entity].singular.toLowerCase()} no longer exists or you don't have permission to change it.`,
      404,
    );
  }
  const row = data[0] as { is_active: boolean; updated_at: string };
  return { isActive: row.is_active, updatedAt: row.updated_at };
}

export type DeleteResult = { imageRemoved: boolean; warning?: string };

export async function deleteEntity(entity: EntityKey, id: string): Promise<DeleteResult> {
  const { name, idField } = ENTITY_CONFIG[entity].deleteFunction;
  const { data, error } = await createClient().functions.invoke<{
    success?: boolean;
    image_removed?: boolean;
    warning?: string;
  }>(name, { body: { [idField]: id } });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const status = (error.context as Response).status;
      if (status === 401) throw new EntityRequestError("unauthenticated", ENTITY_ERROR_MESSAGES.unauthenticated, 401);
      if (status === 403) throw new EntityRequestError("forbidden", ENTITY_ERROR_MESSAGES.forbidden, 403);
      if (status === 404) throw new EntityRequestError("not_found", ENTITY_ERROR_MESSAGES.not_found, 404);
      if (status === 409)
        throw new EntityRequestError(
          "conflict",
          `This ${ENTITY_CONFIG[entity].singular.toLowerCase()} couldn't be deleted because the database blocked it.`,
          409,
        );
      // The function embeds raw database messages in 5xx bodies; never surface them.
      throw new EntityRequestError(
        "server_error",
        `The ${ENTITY_CONFIG[entity].singular.toLowerCase()} couldn't be deleted. It may still be referenced by other records.`,
        status,
      );
    }
    if (error instanceof FunctionsFetchError) {
      throw new EntityRequestError("network", ENTITY_ERROR_MESSAGES.network);
    }
    throw toEntityError(error);
  }

  if (!data?.success) {
    throw new EntityRequestError("server_error", ENTITY_ERROR_MESSAGES.server_error, 500);
  }
  return { imageRemoved: data.image_removed === true, warning: data.warning };
}

export type DependentCount = { dependent: EntityDependent; count: number | null };

/** Head-only COUNT queries: no rows are transferred. `null` = could not determine. */
export async function countDependents(entity: EntityKey, id: string): Promise<DependentCount[]> {
  const supabase = createClient();
  return Promise.all(
    ENTITY_CONFIG[entity].dependents.map(async (dependent) => {
      const { count, error } = await supabase
        .from(dependent.table)
        .select("id", { count: "exact", head: true })
        .eq(dependent.column, id);
      return { dependent, count: error ? null : (count ?? 0) };
    }),
  );
}

/** Uses the existing `reorder_catalog_entity` RPC (sparse gaps, advisory-locked). */
export async function reorderEntity({ entity, id, targetId, position }: ReorderInput): Promise<void> {
  const { error, status } = await createClient().rpc("reorder_catalog_entity", {
    p_entity: entity,
    p_id: id,
    p_target_id: targetId,
    p_position: position,
  });
  if (error) throw fromPostgresCode(error.code, status);
}
