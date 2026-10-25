import { Suspense } from "react";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { EntityTableSkeleton } from "@/components/dashboard/entities/entity-states";
import { ProductCreateLink } from "@/components/dashboard/products/product-create-link";
import { ProductManagementPage } from "@/components/dashboard/products/product-management-page";
import { ProductsAccessRequired } from "@/components/dashboard/products/product-states";
import { getDashboardUser } from "@/lib/auth/dal";
import { PRODUCT_TABLE_COLUMN_COUNT } from "@/lib/products/constants";

/**
 * Server entry for /products. The header is part of the static shell; the
 * table streams in after the session and role are verified.
 */
export function ProductsPage() {
  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Catalog"
        title="Products"
        description="Everything Stonez Store sells, with sizes, colours, stock and barcodes. The order here is the order customers see."
        actions={
          <ProductCreateLink>
            <Plus aria-hidden />
            New Product
          </ProductCreateLink>
        }
      />
      <Suspense fallback={<EntityTableSkeleton columns={PRODUCT_TABLE_COLUMN_COUNT} />}>
        <ProductsAccessGate />
      </Suspense>
    </div>
  );
}

async function ProductsAccessGate() {
  const user = await getDashboardUser();
  // RLS on products is admin-only; employees would otherwise see a misleading
  // empty list. The API and database enforce this independently.
  if (user.role !== "admin") return <ProductsAccessRequired />;
  return <ProductManagementPage />;
}
