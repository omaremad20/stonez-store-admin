import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";

import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { EntityCreateForm, EntityEditForm, EntityFormSkeleton } from "@/components/dashboard/entities/entity-form-loader";
import { EntityAccessRequired } from "@/components/dashboard/entities/entity-states";
import { getDashboardUser } from "@/lib/auth/dal";
import { ENTITY_CONFIG, safeListUrl, type EntityKey } from "@/lib/entities/config";

type Props = {
  entity: EntityKey;
  kind: "create" | "edit";
  params?: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DESCRIPTIONS: Record<EntityKey, { create: string; edit: string }> = {
  departments: {
    create: "Add a top-level section of the store, such as men's, women's or kids' wear.",
    edit: "Update this department's name, description, image and visibility.",
  },
  brands: {
    create: "Add a label carried by Stonez Store. It can then be assigned to products.",
    edit: "Update this brand's name, description, logo and visibility.",
  },
  categories: {
    create: "Add a product type and, optionally, the department it belongs to.",
    edit: "Update this category's name, department, description, image and visibility.",
  },
  collections: {
    create: "Add a curated or seasonal grouping of products.",
    edit: "Update this collection's name, description, image and visibility.",
  },
};

/** Server entry for /:entity/new and /:entity/:id/edit. */
export function EntityFormPage(props: Props) {
  const config = ENTITY_CONFIG[props.entity];
  return (
    <Suspense
      fallback={
        <div className="grid gap-8">
          <div className="h-24 animate-pulse bg-muted/40" />
          <EntityFormSkeleton withDepartment={config.departmentScope} />
        </div>
      }
    >
      <FormPageBody {...props} />
    </Suspense>
  );
}

async function FormPageBody({ entity, kind, params, searchParams }: Props) {
  const config = ENTITY_CONFIG[entity];
  const user = await getDashboardUser();

  // Validated return URL: the listing with its search / filters / sort intact.
  const returnTo = safeListUrl(config, (await searchParams).from);

  let id: string | null = null;
  if (kind === "edit") {
    id = (await params!).id;
    if (!z.uuid().safeParse(id).success) notFound();
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <div>
          <Link href={returnTo} className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-3 text-muted-foreground" })}>
            <ArrowLeft aria-hidden />
            Back to {config.plural.toLowerCase()}
          </Link>
        </div>
        <PageHeader
          eyebrow={config.plural}
          title={`${kind === "create" ? "Create" : "Edit"} ${config.singular}`}
          description={DESCRIPTIONS[entity][kind]}
        />
      </div>
      {user.role !== "admin" ? (
        <EntityAccessRequired config={config} />
      ) : kind === "create" ? (
        <EntityCreateForm entity={entity} returnTo={returnTo} />
      ) : (
        <EntityEditForm entity={entity} id={id!} returnTo={returnTo} />
      )}
    </div>
  );
}
