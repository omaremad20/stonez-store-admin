import type { Metadata } from "next";

import { ProductFormPage } from "@/components/dashboard/products/form/product-form-page";

export const metadata: Metadata = { title: "Edit Product" };

export default function Page({ params, searchParams }: PageProps<"/products/[id]/edit">) {
  return <ProductFormPage kind="edit" params={params} searchParams={searchParams} />;
}
