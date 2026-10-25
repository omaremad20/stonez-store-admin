import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSafeRedirectPath, isPublicPath, LOGIN_PATH } from "@/lib/auth/redirect";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          supabaseResponse = NextResponse.next({ request });

          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims(): this call
  // validates the JWT and refreshes the session cookies when needed.
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims?.sub);

  const { pathname, search } = request.nextUrl;

  // Optimistic routing only. Real authorization happens in the Data Access
  // Layer (`lib/auth/dal.ts`) close to the data.
  if (!isAuthenticated && pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "unauthenticated", message: "Your session has expired. Sign in again to continue." } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!isAuthenticated && !isPublicPath(pathname)) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    const requested = `${pathname}${search}`;
    if (getSafeRedirectPath(requested) === requested) {
      loginUrl.searchParams.set("next", requested);
    }
    return redirectWithSession(loginUrl, supabaseResponse);
  }

  if (isAuthenticated && pathname === LOGIN_PATH) {
    const destination = getSafeRedirectPath(request.nextUrl.searchParams.get("next"));
    return redirectWithSession(new URL(destination, request.url), supabaseResponse);
  }

  return supabaseResponse;
}

/** Redirect while preserving any refreshed Supabase auth cookies. */
function redirectWithSession(url: URL, sessionResponse: NextResponse) {
  const response = NextResponse.redirect(url);
  sessionResponse.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie);
  });
  return response;
}
