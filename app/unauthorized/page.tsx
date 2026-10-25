import type { Metadata } from "next";
import { ShieldX } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { SwitchAccountButton } from "@/components/auth/switch-account-button";

export const metadata: Metadata = {
  title: "Access denied",
};

/**
 * Reached when a signed-in account is not (or is no longer) an active
 * admin/employee. The callback rejects such accounts at sign-in; this covers
 * roles changed during an existing session.
 */
export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <Logo className="mb-14 h-7" />
        <span className="flex size-10 items-center justify-center border border-border">
          <ShieldX className="size-5" aria-hidden />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">No dashboard access</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          You&apos;re signed in, but this account isn&apos;t an active Stonez Store staff account. Sign in
          with a different Google account, or ask the store administrator for access.
        </p>
        <div className="mt-8">
          <SwitchAccountButton />
        </div>
      </div>
    </main>
  );
}
