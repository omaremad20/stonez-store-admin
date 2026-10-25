import type { Metadata } from "next";

import { EntityFormPage } from "@/components/dashboard/entities/entity-form-page";

export const metadata: Metadata = { title: "Create Brand" };

export default function Page({ searchParams }: PageProps<"/brands/new">) {
  return <EntityFormPage entity="brands" kind="create" searchParams={searchParams} />;
}
