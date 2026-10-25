import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { getDashboardUser } from "@/lib/auth/dal";
import { DASHBOARD_NAV, NAV_GROUP_LABELS } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "Overview",
};

const modules = DASHBOARD_NAV.filter((item) => item.href !== "/overview");

export default function OverviewPage() {
  return (
    <div className="grid gap-10">
      <PageHeader
        eyebrow="Overview"
        title={
          <Suspense fallback="Welcome back">
            <Greeting />
          </Suspense>
        }
        description="This is the administration dashboard for Stonez Store, Nasr City. Manage the catalog, follow orders and customers, and configure the store from here."
      />

      <section aria-labelledby="modules-heading" className="grid gap-4">
        <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
          <h2 id="modules-heading" className="text-sm font-semibold">
            Dashboard modules
          </h2>
          <p className="hidden text-xs text-muted-foreground sm:block">Modules are being rolled out in phases.</p>
        </div>

        <ul className="grid border-t border-l border-border sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href} className="border-r border-b border-border">
                <Link
                  href={item.href}
                  className="group flex h-full flex-col gap-4 p-5 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-9 items-center justify-center border border-border bg-background">
                      <Icon className="size-4" strokeWidth={1.75} aria-hidden />
                    </span>
                    <ArrowUpRight
                      className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground"
                      aria-hidden
                    />
                  </div>
                  <div className="grid gap-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold">{item.title}</h3>
                      {item.status === "placeholder" && (
                        <span className="border border-dashed border-border px-1.5 py-px text-[0.5625rem] font-medium tracking-wide text-muted-foreground uppercase">
                          Coming soon
                        </span>
                      )}
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                  </div>
                  <p className="mt-auto text-[0.625rem] font-medium tracking-[0.2em] text-muted-foreground/80 uppercase">
                    {NAV_GROUP_LABELS[item.group]}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

async function Greeting() {
  const user = await getDashboardUser();
  const firstName = user.name?.split(/\s+/)[0];
  return <>{firstName ? `Welcome back, ${firstName}` : "Welcome back"}</>;
}
