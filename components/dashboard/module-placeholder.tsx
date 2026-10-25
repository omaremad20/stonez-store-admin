import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Hammer } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { DEFAULT_AUTHENTICATED_PATH } from "@/lib/auth/redirect";
import { getNavItem } from "@/lib/navigation";

/**
 * Temporary page body for modules that exist in the route map but are built
 * in a later phase. Replace the route's page.tsx when the module is implemented.
 */
export function ModulePlaceholder({ href }: { href: string }) {
  const item = getNavItem(href);
  if (!item) notFound();

  const Icon = item.icon;

  return (
    <div className="grid gap-8">
      <PageHeader eyebrow="Module" title={item.title} description={item.description} />

      <section
        aria-labelledby="placeholder-title"
        className="flex flex-col items-start gap-5 border border-dashed border-border px-6 py-12 sm:items-center sm:px-10 sm:py-20 sm:text-center"
      >
        <div className="relative flex size-12 items-center justify-center border border-border bg-muted/50">
          <Icon className="size-5 text-muted-foreground" aria-hidden />
          <span className="absolute -right-2 -bottom-2 flex size-6 items-center justify-center border border-border bg-background">
            <Hammer className="size-3 text-muted-foreground" aria-hidden />
          </span>
        </div>
        <div className="grid gap-2">
          <h2 id="placeholder-title" className="text-base font-semibold">
            {item.title} isn&apos;t built yet
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            This route is reserved so navigation works. Management tools for{" "}
            {item.title.toLowerCase()} are planned for an upcoming phase.
          </p>
        </div>
        <Link href={DEFAULT_AUTHENTICATED_PATH} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <ArrowLeft aria-hidden />
          Back to overview
        </Link>
      </section>
    </div>
  );
}
