import type { Metadata } from "next";

import { EntityFormPage } from "@/components/dashboard/entities/entity-form-page";

export const metadata: Metadata = { title: "Edit Category" };

export default function Page({ params, searchParams }: PageProps<"/categories/[id]/edit">) {
  return <EntityFormPage entity="categories" kind="edit" params={params} searchParams={searchParams} />;
}
