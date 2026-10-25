import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { EntityManagementPage } from "@/components/dashboard/entities/entity-management-page";
import { EntityAccessRequired, EntityTableSkeleton } from "@/components/dashboard/entities/entity-states";
import { getDashboardUser } from "@/lib/auth/dal";
import { ENTITY_CONFIG, entityRoutes, type EntityKey } from "@/lib/entities/config";

/**
 * Server entry for an entity listing route. The header is part of the static
 * shell; the table streams in after the session and role are verified.
 */
export function EntityPage({ entity }: { entity: EntityKey }) {
  const config = ENTITY_CONFIG[entity];

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Catalog"
        title={config.plural}
        description={config.description}
        actions={
          <Link href={entityRoutes(config).create} className={buttonVariants()}>
            <Plus aria-hidden />
            New {config.singular}
          </Link>
        }
      />
      <Suspense fallback={<EntityTableSkeleton columns={config.columns.length + 1} />}>
        <EntityAccessGate entity={entity} />
      </Suspense>
    </div>
  );
}

async function EntityAccessGate({ entity }: { entity: EntityKey }) {
  const user = await getDashboardUser();
  // RLS on all four tables is admin-only; employees would otherwise see a
  // misleading empty list. The API and database enforce this independently.
  if (user.role !== "admin") {
    return <EntityAccessRequired config={ENTITY_CONFIG[entity]} />;
  }
  return <EntityManagementPage entity={entity} />;
}
