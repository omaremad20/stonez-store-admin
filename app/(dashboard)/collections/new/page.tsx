import type { Metadata } from "next";

import { EntityFormPage } from "@/components/dashboard/entities/entity-form-page";

export const metadata: Metadata = { title: "Create Collection" };

export default function Page({ searchParams }: PageProps<"/collections/new">) {
  return <EntityFormPage entity="collections" kind="create" searchParams={searchParams} />;
}
