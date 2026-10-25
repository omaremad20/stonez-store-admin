import type { Metadata } from "next";

import { EntityFormPage } from "@/components/dashboard/entities/entity-form-page";

export const metadata: Metadata = { title: "Edit Department" };

export default function Page({ params, searchParams }: PageProps<"/departments/[id]/edit">) {
  return <EntityFormPage entity="departments" kind="edit" params={params} searchParams={searchParams} />;
}
