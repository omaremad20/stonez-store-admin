import "server-only";

import { NextResponse } from "next/server";

import { ENTITY_CONFIG, isEntityKey, type EntityKey } from "@/lib/entities/config";
import { ENTITY_ERROR_MESSAGES, EntityRequestError } from "@/lib/entities/errors";
import type { EntityApiErrorBody, EntityApiErrorCode } from "@/lib/entities/types";
import { createClient } from "@/lib/supabase/server";

export const NO_STORE = { "Cache-Control": "no-store" };

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export function errorResponse(
  code: EntityApiErrorCode,
  status: number,
  message: string = ENTITY_ERROR_MESSAGES[code],
  fieldErrors?: EntityApiErrorBody["error"]["fieldErrors"],
) {
  return NextResponse.json<EntityApiErrorBody>(
    { error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) } },
    { status, headers: NO_STORE },
  );
}

export function toErrorResponse(error: unknown) {
  if (error instanceof EntityRequestError) {
    return errorResponse(error.code, error.status || 500, error.message, error.fieldErrors);
  }
  console.error("[entities] unexpected error", error);
  return errorResponse("server_error", 500);
}

/**
 * Verified session (getClaims validates the JWT) plus the admin role required
 * by RLS on the catalog tables. The returned client is the caller's session
 * client, so RLS and the audit triggers still see the real user.
 */
export async function authorizeAdminRequest(
  sectionPlural: string,
): Promise<{ ok: true; supabase: ServerSupabase } | { ok: false; response: NextResponse }> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    return { ok: false, response: errorResponse("unauthenticated", 401) };
  }

  const { data: isAdmin, error } = await supabase.rpc("is_admin");
  if (error) return { ok: false, response: errorResponse("server_error", 500) };
  if (isAdmin !== true) {
    return {
      ok: false,
      response: errorResponse("forbidden", 403, `Only administrators can manage ${sectionPlural.toLowerCase()}.`),
    };
  }

  return { ok: true, supabase };
}

/** Shared guard for every entity Route Handler: known entity + `authorizeAdminRequest`. */
export async function authorizeEntityRequest(
  rawEntity: string,
): Promise<{ ok: true; entity: EntityKey; supabase: ServerSupabase } | { ok: false; response: NextResponse }> {
  if (!isEntityKey(rawEntity)) {
    return { ok: false, response: errorResponse("not_found", 404, "Unknown section.") };
  }

  const auth = await authorizeAdminRequest(ENTITY_CONFIG[rawEntity].plural);
  if (!auth.ok) return auth;
  return { ok: true, entity: rawEntity, supabase: auth.supabase };
}

/** Parses a JSON body without throwing on malformed input. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
