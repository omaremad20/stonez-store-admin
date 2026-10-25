import type { Metadata } from "next";

import { EntityFormPage } from "@/components/dashboard/entities/entity-form-page";

export const metadata: Metadata = { title: "Create Category" };

export default function Page({ searchParams }: PageProps<"/categories/new">) {
  return <EntityFormPage entity="categories" kind="create" searchParams={searchParams} />;
}
