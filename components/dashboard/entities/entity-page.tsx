import { Suspense } from "react";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { EntityCreateLink } from "@/components/dashboard/entities/entity-create-link";
import { EntityManagementPage } from "@/components/dashboard/entities/entity-management-page";
import { EntityAccessRequired, EntityTableSkeleton } from "@/components/dashboard/entities/entity-states";
import { getDashboardUser } from "@/lib/auth/dal";
import { ENTITY_CONFIG, type EntityKey } from "@/lib/entities/config";

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
          <EntityCreateLink config={config}>
            <Plus aria-hidden />
            New {config.singular}
          </EntityCreateLink>
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
