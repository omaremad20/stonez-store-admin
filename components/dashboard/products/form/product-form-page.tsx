import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";

import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProductCreateForm, ProductEditForm } from "@/components/dashboard/products/form/product-form-loader";
import { ProductFormSkeleton, ProductsAccessRequired } from "@/components/dashboard/products/product-states";
import { getDashboardUser } from "@/lib/auth/dal";
import { PRODUCTS_HREF, safeProductReturnUrl } from "@/lib/products/constants";

type Props = {
  kind: "create" | "edit";
  params?: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Server entry for /products/new and /products/[id]/edit — one shared form. */
export function ProductFormPage(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="grid gap-8">
          <div className="h-24 animate-pulse bg-muted/40" />
          <ProductFormSkeleton />
        </div>
      }
    >
      <FormPageBody {...props} />
    </Suspense>
  );
}

async function FormPageBody({ kind, params, searchParams }: Props) {
  const user = await getDashboardUser();
  // Validated return URL: the listing (with its search / filters / sort) or the product page.
  const returnTo = safeProductReturnUrl((await searchParams).from);

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
            {returnTo.startsWith(`${PRODUCTS_HREF}/`) ? "Back to product" : "Back to products"}
          </Link>
        </div>
        <PageHeader
          eyebrow="Products"
          title={kind === "create" ? "Create Product" : "Edit Product"}
          description={
            kind === "create"
              ? "Add a product with its pricing, organisation and variants. Barcodes are generated for each variant when you save."
              : "Update the product and its variants. Everything is saved together."
          }
        />
      </div>
      {user.role !== "admin" ? (
        <ProductsAccessRequired />
      ) : kind === "create" ? (
        <ProductCreateForm returnTo={returnTo} />
      ) : (
        <ProductEditForm id={id!} returnTo={returnTo} />
      )}
    </div>
  );
}
