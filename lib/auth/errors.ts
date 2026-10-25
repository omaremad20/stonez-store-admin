/**
 * Error codes passed to `/login?error=<code>`. Messages are deliberately
 * generic so no provider or implementation details leak to the UI.
 */
export const AUTH_ERROR_MESSAGES = {
  cancelled: "Google sign-in was cancelled. You can try again whenever you're ready.",
  oauth_failed: "Google couldn't complete the sign-in. Please try again.",
  oauth_start_failed: "We couldn't reach Google right now. Check your connection and try again.",
  missing_code: "The sign-in link was incomplete or has expired. Please try again.",
  exchange_failed: "Your sign-in session expired before it finished. Please try again.",
  unauthorized: "This Google account doesn't have access to the Stonez Store dashboard.",
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERROR_MESSAGES;

export function getAuthErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return code in AUTH_ERROR_MESSAGES
    ? AUTH_ERROR_MESSAGES[code as AuthErrorCode]
    : AUTH_ERROR_MESSAGES.oauth_failed;
}
