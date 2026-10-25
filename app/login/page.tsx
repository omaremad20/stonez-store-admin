import { Suspense } from "react";
import type { Metadata } from "next";

import { Logo } from "@/components/brand/logo";
import { GoogleSignIn, GoogleSignInFallback } from "@/components/auth/google-sign-in";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <section
        aria-hidden
        className="relative hidden flex-col justify-between overflow-hidden bg-foreground p-12 text-background lg:flex xl:p-16"
      >
        <Logo inverted priority className="h-8" />

        <div className="grid gap-6">
          <p className="text-[0.6875rem] font-semibold tracking-[0.32em] text-background/50 uppercase">
            Nasr City — Cairo
          </p>
          <p className="max-w-md text-5xl leading-[1.05] font-semibold tracking-tight xl:text-6xl">
            Everything behind the storefront.
          </p>
          <p className="max-w-sm text-sm leading-relaxed text-background/60">
            Catalog, orders, customers and store settings — managed from one place.
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-background/15 pt-6 text-xs text-background/45">
          <span>Stonez Store Dashboard</span>
          <span className="tracking-[0.2em] uppercase">Staff only</span>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-16 sm:px-10">
        <div className="w-full max-w-sm">
          <Logo priority className="mb-14 h-7 lg:hidden" />

          <p className="text-[0.6875rem] font-semibold tracking-[0.28em] text-muted-foreground uppercase">
            Staff access
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance">
            Sign in to the dashboard
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Use the Google account linked to your Stonez Store staff profile.
          </p>

          <div className="mt-10">
            <Suspense fallback={<GoogleSignInFallback />}>
              <GoogleSignIn />
            </Suspense>
          </div>

          <p className="mt-10 border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
            Access is limited to active staff accounts. If you think you should have access,
            contact the store administrator.
          </p>
        </div>
      </section>
    </main>
  );
}
