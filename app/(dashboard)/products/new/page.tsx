import type { Metadata } from "next";

import { ProductFormPage } from "@/components/dashboard/products/form/product-form-page";

export const metadata: Metadata = { title: "Create Product" };

export default function Page({ searchParams }: PageProps<"/products/new">) {
  return <ProductFormPage kind="create" searchParams={searchParams} />;
}
