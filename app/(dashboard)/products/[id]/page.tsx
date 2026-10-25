import type { Metadata } from "next";

import { ProductDetailsPage } from "@/components/dashboard/products/details/product-details-page";

export const metadata: Metadata = { title: "Product" };

export default function Page({ params, searchParams }: PageProps<"/products/[id]">) {
  return <ProductDetailsPage params={params} searchParams={searchParams} />;
}
