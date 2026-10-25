import type { Metadata } from "next";

import { EntityFormPage } from "@/components/dashboard/entities/entity-form-page";

export const metadata: Metadata = { title: "Edit Collection" };

export default function Page({ params, searchParams }: PageProps<"/collections/[id]/edit">) {
  return <EntityFormPage entity="collections" kind="edit" params={params} searchParams={searchParams} />;
}
