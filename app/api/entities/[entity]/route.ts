import { NextResponse, type NextRequest } from "next/server";

import { ENTITY_CONFIG, isEntityKey } from "@/lib/entities/config";
import { ENTITY_ERROR_MESSAGES, EntityRequestError } from "@/lib/entities/errors";
import { listEntityPage } from "@/lib/entities/list.server";
import { decodeCursor } from "@/lib/entities/postgrest";
import { parseQueryState } from "@/lib/entities/query-state";
import type { EntityApiErrorBody, EntityApiErrorCode } from "@/lib/entities/types";
import { createClient } from "@/lib/supabase/server";

const NO_STORE = { "Cache-Control": "no-store" };

function errorResponse(code: EntityApiErrorCode, status: number, message = ENTITY_ERROR_MESSAGES[code]) {
  return NextResponse.json<EntityApiErrorBody>({ error: { code, message } }, { status, headers: NO_STORE });
}

/**
 * GET /api/entities/:entity?q&status&sort&dir&department&cursor&limit
 *
 * Shared listing endpoint for departments, brands, categories and collections.
 * Every request is capped at 25 rows server-side (see `resolveFetchSize`),
 * whatever `limit` the client sends.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/entities/[entity]">) {
  const { entity } = await ctx.params;
  if (!isEntityKey(entity)) {
    return errorResponse("not_found", 404, "Unknown section.");
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    return errorResponse("unauthenticated", 401);
  }

  // All four tables are admin-only under RLS. Checking up front turns a silent
  // empty result for employees into an explicit, explainable state.
  const { data: isAdmin, error: roleError } = await supabase.rpc("is_admin");
  if (roleError) return errorResponse("server_error", 500);
  if (isAdmin !== true) {
    return errorResponse(
      "forbidden",
      403,
      `Only administrators can manage ${ENTITY_CONFIG[entity].plural.toLowerCase()}.`,
    );
  }

  const params = request.nextUrl.searchParams;
  const state = parseQueryState(params, ENTITY_CONFIG[entity]);

  const rawCursor = params.get("cursor");
  const cursor = rawCursor ? decodeCursor(rawCursor, state.sort, state.dir) : null;
  if (rawCursor && !cursor) {
    return errorResponse("bad_request", 400, "This list position is no longer valid. Reload the list.");
  }

  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? null : Number.parseInt(rawLimit, 10);

  try {
    const page = await listEntityPage(supabase, entity, state, cursor, limit);
    return NextResponse.json(page, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof EntityRequestError) {
      return errorResponse(error.code, error.status || 500, error.message);
    }
    return errorResponse("server_error", 500);
  }
}
