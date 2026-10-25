import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { ENTITY_FORM_RULES } from "@/lib/entities/form-schema";
import { findByName } from "@/lib/entities/mutations.server";
import { authorizeEntityRequest, errorResponse, NO_STORE, toErrorResponse } from "@/lib/entities/route-helpers.server";

const querySchema = z.object({
  name: z.string().trim().min(2).max(64),
  exclude: z.uuid().nullable(),
});

/**
 * GET /api/entities/:entity/check-name?name=…&exclude=<id>
 *
 * Only for tables with a case-insensitive unique name index. Powers the
 * debounced availability hint and the verification step after an uncertain
 * create. The unique index stays authoritative on submit.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/entities/[entity]/check-name">) {
  const auth = await authorizeEntityRequest((await ctx.params).entity);
  if (!auth.ok) return auth.response;
  if (!ENTITY_FORM_RULES[auth.entity].uniqueName) {
    return errorResponse("bad_request", 400, "Names are not unique in this section.");
  }

  const parsed = querySchema.safeParse({
    name: request.nextUrl.searchParams.get("name") ?? "",
    exclude: request.nextUrl.searchParams.get("exclude"),
  });
  if (!parsed.success) return errorResponse("bad_request", 400);

  try {
    const existing = await findByName(auth.supabase, auth.entity, parsed.data.name, parsed.data.exclude);
    return NextResponse.json({ available: existing === null, existingId: existing?.id ?? null }, { headers: NO_STORE });
  } catch (error) {
    return toErrorResponse(error);
  }
}
