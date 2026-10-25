import type { Metadata } from "next";

import { EntityFormPage } from "@/components/dashboard/entities/entity-form-page";

export const metadata: Metadata = { title: "Create Department" };

export default function Page({ searchParams }: PageProps<"/departments/new">) {
  return <EntityFormPage entity="departments" kind="create" searchParams={searchParams} />;
}
