import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";

import { buttonVariants } from "@/components/ui/button";
import { ProductDetails } from "@/components/dashboard/products/details/product-details";
import { ProductDetailsSkeleton, ProductsAccessRequired } from "@/components/dashboard/products/product-states";
import { getDashboardUser } from "@/lib/auth/dal";
import { safeProductsListUrl } from "@/lib/products/constants";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Server entry for /products/[id]: validates the id and role, then streams the details. */
export function ProductDetailsPage(props: Props) {
  return (
    <Suspense fallback={<ProductDetailsSkeleton />}>
      <DetailsBody {...props} />
    </Suspense>
  );
}

async function DetailsBody({ params, searchParams }: Props) {
  const user = await getDashboardUser();
  const backHref = safeProductsListUrl((await searchParams).from);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div>
        <Link href={backHref} className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-3 text-muted-foreground" })}>
          <ArrowLeft aria-hidden />
          Back to products
        </Link>
      </div>
      {user.role !== "admin" ? <ProductsAccessRequired /> : <ProductDetails id={id.toLowerCase()} backHref={backHref} />}
    </div>
  );
}
