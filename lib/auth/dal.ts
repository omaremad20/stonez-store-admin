import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  hasDashboardAccess,
  PROFILE_ACCESS_COLUMNS,
  type DashboardRole,
  type ProfileAccessRow,
} from "@/lib/auth/access";
import { LOGIN_PATH, UNAUTHORIZED_PATH } from "@/lib/auth/redirect";

export type DashboardUser = {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  role: DashboardRole;
};

function readString(source: Record<string, unknown> | undefined, key: string): string | null {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Data Access Layer entry point for the dashboard.
 *
 * Verifies the session server-side (`getClaims()` validates the JWT, it does
 * not trust the cookie blindly), then checks the user's existing profile role.
 * Call this from every Server Component, Server Action or Route Handler that
 * reads or mutates dashboard data — the proxy redirect alone is not a security
 * boundary. Memoised per request with React `cache`.
 */
export const getDashboardUser = cache(async (): Promise<DashboardUser> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) {
    redirect(LOGIN_PATH);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(PROFILE_ACCESS_COLUMNS)
    .eq("id", claims.sub)
    .maybeSingle<ProfileAccessRow>();

  if (!hasDashboardAccess(profile)) {
    redirect(UNAUTHORIZED_PATH);
  }

  const metadata = claims.user_metadata as Record<string, unknown> | undefined;

  return {
    id: claims.sub,
    email: profile.email ?? (typeof claims.email === "string" ? claims.email : null),
    name:
      profile.full_name?.trim() ||
      readString(metadata, "full_name") ||
      readString(metadata, "name"),
    avatarUrl:
      readString(metadata, "avatar_url") ||
      readString(metadata, "picture") ||
      profile.avatar_url,
    role: profile.role,
  };
});
