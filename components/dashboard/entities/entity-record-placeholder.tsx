import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Hammer } from "lucide-react";
import { z } from "zod";

import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { EntityAccessRequired } from "@/components/dashboard/entities/entity-states";
import { getDashboardUser } from "@/lib/auth/dal";
import { ENTITY_CONFIG, type EntityConfig, type EntityKey } from "@/lib/entities/config";
import { createClient } from "@/lib/supabase/server";

type Kind = "create" | "detail" | "edit";

type Props = {
  entity: EntityKey;
  kind: Kind;
  params?: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const COPY: Record<Kind, { eyebrow: (c: EntityConfig) => string; body: (c: EntityConfig) => string }> = {
  create: {
    eyebrow: (c) => `New ${c.singular.toLowerCase()}`,
    body: (c) => `The form for creating ${c.plural.toLowerCase()} is planned for an upcoming phase.`,
  },
  detail: {
    eyebrow: (c) => c.singular,
    body: (c) => `A full ${c.singular.toLowerCase()} detail view is planned for an upcoming phase.`,
  },
  edit: {
    eyebrow: (c) => `Edit ${c.singular.toLowerCase()}`,
    body: (c) => `Editing ${c.plural.toLowerCase()} is planned for an upcoming phase.`,
  },
};

/**
 * Lightweight stand-in for the create / detail / edit routes so the table's
 * actions have real destinations. Replace per route when the feature ships.
 */
export function EntityRecordPlaceholder(props: Props) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse bg-muted/40" />}>
      <PlaceholderBody {...props} />
    </Suspense>
  );
}

/** Only accept a return URL that points back to this entity's own listing. */
function safeReturnUrl(config: EntityConfig, raw: string | string[] | undefined): string {
  if (typeof raw !== "string" || raw.length > 512) return config.href;
  try {
    const url = new URL(raw, "http://stonez.local");
    if (url.origin !== "http://stonez.local" || url.pathname !== config.href) return config.href;
    return `${url.pathname}${url.search}`;
  } catch {
    return config.href;
  }
}

async function PlaceholderBody({ entity, kind, params, searchParams }: Props) {
  const config = ENTITY_CONFIG[entity];
  const user = await getDashboardUser();
  if (user.role !== "admin") return <EntityAccessRequired config={config} />;

  const backHref = safeReturnUrl(config, (await searchParams).from);

  let title = `New ${config.singular}`;
  if (kind !== "create") {
    const id = (await params!).id;
    if (!z.uuid().safeParse(id).success) notFound();

    const supabase = await createClient();
    const { data } = await supabase.from(entity).select("name").eq("id", id).maybeSingle<{ name: string }>();
    if (!data) notFound();
    title = data.name;
  }

  return (
    <div className="grid gap-8">
      <div>
        <Link href={backHref} className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-3 text-muted-foreground" })}>
          <ArrowLeft aria-hidden />
          Back to {config.plural.toLowerCase()}
        </Link>
      </div>
      <PageHeader eyebrow={COPY[kind].eyebrow(config)} title={title} />
      <section className="flex flex-col items-start gap-4 border border-dashed border-border px-6 py-14 sm:items-center sm:text-center">
        <span className="flex size-11 items-center justify-center border border-border bg-muted/40">
          <Hammer className="size-5 text-muted-foreground" aria-hidden />
        </span>
        <div className="grid max-w-md gap-1.5">
          <h2 className="text-base font-semibold">Not built yet</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{COPY[kind].body(config)}</p>
        </div>
      </section>
    </div>
  );
}
