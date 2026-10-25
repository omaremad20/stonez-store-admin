"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSignOut } from "@/lib/auth/use-sign-out";

export function SwitchAccountButton() {
  const { signOut, isPending } = useSignOut();

  return (
    <Button className="w-full" onClick={() => void signOut()} disabled={isPending} aria-busy={isPending}>
      {isPending && <Loader2 className="animate-spin" aria-hidden />}
      {isPending ? "Signing out…" : "Use a different account"}
    </Button>
  );
}
