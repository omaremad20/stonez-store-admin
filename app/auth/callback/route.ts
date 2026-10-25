import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { hasDashboardAccess, PROFILE_ACCESS_COLUMNS, type ProfileAccessRow } from "@/lib/auth/access";
import type { AuthErrorCode } from "@/lib/auth/errors";
import { getSafeRedirectPath, LOGIN_PATH } from "@/lib/auth/redirect";

/**
 * Google → Supabase → here. Exchanges the PKCE auth code for a session
 * (cookies are written through the server client), verifies dashboard access
 * against the existing profile role, then redirects to a validated path.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = getSafeRedirectPath(searchParams.get("next"));

  const providerError = searchParams.get("error");
  if (providerError) {
    return redirectToLogin(origin, providerError === "access_denied" ? "cancelled" : "oauth_failed", next);
  }

  const code = searchParams.get("code");
  if (!code) {
    return redirectToLogin(origin, "missing_code", next);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return redirectToLogin(origin, "exchange_failed", next);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(PROFILE_ACCESS_COLUMNS)
    .eq("id", data.user.id)
    .maybeSingle<ProfileAccessRow>();

  if (!hasDashboardAccess(profile)) {
    await supabase.auth.signOut({ scope: "local" });
    return redirectToLogin(origin, "unauthorized");
  }

  return NextResponse.redirect(new URL(next, origin));
}

function redirectToLogin(origin: string, code: AuthErrorCode, next?: string) {
  const url = new URL(LOGIN_PATH, origin);
  url.searchParams.set("error", code);
  if (next) url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}
