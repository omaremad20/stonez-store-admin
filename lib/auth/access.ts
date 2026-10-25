/**
 * Dashboard access is based on the existing `public.profiles.role` / `is_active`
 * columns (see `public.is_admin()` and `handle_new_user()` in Supabase).
 * Self-service Google sign-ups are always created as `customer`, so they are
 * rejected here. Remove "employee" to make the dashboard admin-only.
 */
export const DASHBOARD_ROLES = ["admin", "employee"] as const;

export type DashboardRole = (typeof DASHBOARD_ROLES)[number];

export type ProfileAccessRow = {
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: string | null;
  is_active: boolean | null;
};

export const PROFILE_ACCESS_COLUMNS = "full_name, email, avatar_url, role, is_active";

export function isDashboardRole(role: string | null | undefined): role is DashboardRole {
  return DASHBOARD_ROLES.some((allowed) => allowed === role);
}

export function hasDashboardAccess(
  profile: ProfileAccessRow | null | undefined,
): profile is ProfileAccessRow & { role: DashboardRole; is_active: true } {
  return Boolean(profile && profile.is_active === true && isDashboardRole(profile.role));
}
