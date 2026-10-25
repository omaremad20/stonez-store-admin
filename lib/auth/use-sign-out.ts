"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { LOGIN_PATH } from "@/lib/auth/redirect";

/**
 * Signs out of this device and hard-navigates to the login page so no cached
 * dashboard RSC payload survives in the client router.
 */
export function useSignOut() {
  const [isPending, setIsPending] = useState(false);
  const inFlight = useRef(false);

  const signOut = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setIsPending(true);

    const { error } = await createClient().auth.signOut({ scope: "local" });

    if (error) {
      inFlight.current = false;
      setIsPending(false);
      toast.error("We couldn't sign you out. Please try again.");
      return false;
    }

    window.location.replace(LOGIN_PATH);
    return true;
  }, []);

  return { signOut, isPending };
}
