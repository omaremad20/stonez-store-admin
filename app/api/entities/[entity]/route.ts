import { NextResponse, type NextRequest } from "next/server";

import { ENTITY_CONFIG } from "@/lib/entities/config";
import { payloadSchemaFor, toFieldErrors } from "@/lib/entities/form-schema";
import { listEntityPage } from "@/lib/entities/list.server";
import { createEntity } from "@/lib/entities/mutations.server";
import { decodeCursor } from "@/lib/entities/postgrest";
import { parseQueryState } from "@/lib/entities/query-state";
import {
  authorizeEntityRequest,
  errorResponse,
  NO_STORE,
  readJson,
  toErrorResponse,
} from "@/lib/entities/route-helpers.server";

/**
 * GET /api/entities/:entity?q&status&sort&dir&department&cursor&limit
 *
 * Shared listing endpoint for departments, brands, categories and collections.
 * Every request is capped at 25 rows server-side (see `resolveFetchSize`),
 * whatever `limit` the client sends.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/entities/[entity]">) {
  const auth = await authorizeEntityRequest((await ctx.params).entity);
  if (!auth.ok) return auth.response;
  const { entity, supabase } = auth;

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
    return toErrorResponse(error);
  }
}

/**
 * POST /api/entities/:entity — create one record.
 * The body is re-validated with the same schema the form uses; database
 * constraints and RLS remain authoritative.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/entities/[entity]">) {
  const auth = await authorizeEntityRequest((await ctx.params).entity);
  if (!auth.ok) return auth.response;
  const { entity, supabase } = auth;

  const parsed = payloadSchemaFor(entity, "create").safeParse(await readJson(request));
  if (!parsed.success) {
    return errorResponse("validation", 422, undefined, toFieldErrors(parsed.error));
  }

  try {
    const record = await createEntity(supabase, entity, {
      ...parsed.data,
      departmentId: parsed.data.departmentId ?? null,
      clientId: "clientId" in parsed.data ? parsed.data.clientId : undefined,
    });
    return NextResponse.json({ record }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return toErrorResponse(error);
  }
}
