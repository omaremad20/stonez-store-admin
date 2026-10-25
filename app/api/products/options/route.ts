import { NextResponse } from "next/server";

import { authorizeAdminRequest, NO_STORE } from "@/lib/entities/route-helpers.server";
import { listProductOptions } from "@/lib/products/read.server";
import { toProductErrorResponse } from "@/lib/products/route-helpers.server";

/**
 * GET /api/products/options — brands, categories (with department), collections,
 * departments and the store-wide pre-order switch, for the product form and
 * the listing filters.
 */
export async function GET() {
  const auth = await authorizeAdminRequest("products");
  if (!auth.ok) return auth.response;

  try {
    const options = await listProductOptions(auth.supabase);
    return NextResponse.json(options, { headers: NO_STORE });
  } catch (error) {
    return toProductErrorResponse(error);
  }
}
