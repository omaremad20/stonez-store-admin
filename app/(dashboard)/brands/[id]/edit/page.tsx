import type { Metadata } from "next";

import { EntityFormPage } from "@/components/dashboard/entities/entity-form-page";

export const metadata: Metadata = { title: "Edit Brand" };

export default function Page({ params, searchParams }: PageProps<"/brands/[id]/edit">) {
  return <EntityFormPage entity="brands" kind="edit" params={params} searchParams={searchParams} />;
}
