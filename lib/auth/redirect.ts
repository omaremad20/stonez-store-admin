export const LOGIN_PATH = "/login";
export const AUTH_CALLBACK_PATH = "/auth/callback";
export const UNAUTHORIZED_PATH = "/unauthorized";
export const DEFAULT_AUTHENTICATED_PATH = "/overview";

/** Routes reachable without a session. Everything else is protected by the proxy. */
const PUBLIC_PATH_PREFIXES = [LOGIN_PATH, "/auth"] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Returns a same-origin, relative path that is safe to redirect to after login.
 * Anything absolute, protocol-relative, malformed or pointing back into the
 * auth flow falls back to the default dashboard destination.
 */
export function getSafeRedirectPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return DEFAULT_AUTHENTICATED_PATH;
  }

  try {
    const base = "http://stonez.local";
    const url = new URL(value, base);
    const path = `${url.pathname}${url.search}${url.hash}`;

    if (
      url.origin !== base ||
      path.startsWith("//") ||
      isPublicPath(url.pathname) ||
      url.pathname === UNAUTHORIZED_PATH
    ) {
      return DEFAULT_AUTHENTICATED_PATH;
    }

    return path === "/" ? DEFAULT_AUTHENTICATED_PATH : path;
  } catch {
    return DEFAULT_AUTHENTICATED_PATH;
  }
}
