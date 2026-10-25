"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CircleAlert, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GoogleIcon } from "@/components/auth/google-icon";
import { createClient } from "@/lib/supabase/client";
import { AUTH_ERROR_MESSAGES, getAuthErrorMessage } from "@/lib/auth/errors";
import { AUTH_CALLBACK_PATH, getSafeRedirectPath } from "@/lib/auth/redirect";

const buttonClassName =
  "h-12 w-full gap-3 border-border bg-background text-sm font-medium tracking-normal normal-case hover:bg-muted";

export function GoogleSignIn() {
  const searchParams = useSearchParams();
  const next = getSafeRedirectPath(searchParams.get("next"));
  const callbackError = getAuthErrorMessage(searchParams.get("error"));

  const [isRedirecting, setIsRedirecting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const inFlight = useRef(false);

  // If the user returns from Google with the browser back button, the page can
  // be restored from the bfcache with the loading state still set.
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        inFlight.current = false;
        setIsRedirecting(false);
      }
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  async function handleSignIn() {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsRedirecting(true);
    setStartError(null);

    const redirectTo = new URL(AUTH_CALLBACK_PATH, window.location.origin);
    redirectTo.searchParams.set("next", next);

    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo.toString(),
        queryParams: { prompt: "select_account" },
      },
    });

    if (error) {
      inFlight.current = false;
      setIsRedirecting(false);
      setStartError(AUTH_ERROR_MESSAGES.oauth_start_failed);
    }
    // On success the browser is already navigating to Google; keep the
    // loading state so the button can't be pressed twice.
  }

  const errorMessage = startError ?? (isRedirecting ? null : callbackError);

  return (
    <div className="grid gap-4">
      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-3 border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm leading-relaxed text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{errorMessage}</p>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        className={buttonClassName}
        onClick={handleSignIn}
        disabled={isRedirecting}
        aria-busy={isRedirecting}
      >
        {isRedirecting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <GoogleIcon className="size-[18px]" />
        )}
        {isRedirecting ? "Redirecting to Google…" : "Continue with Google"}
      </Button>

      <p className="sr-only" aria-live="polite">
        {isRedirecting ? "Redirecting to Google sign-in." : ""}
      </p>
    </div>
  );
}

export function GoogleSignInFallback() {
  return (
    <Button type="button" variant="outline" className={buttonClassName} disabled>
      <GoogleIcon className="size-[18px]" />
      Continue with Google
    </Button>
  );
}
