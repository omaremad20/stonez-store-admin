import type { Metadata } from "next";

import { EntityRecordPlaceholder } from "@/components/dashboard/entities/entity-record-placeholder";

export const metadata: Metadata = { title: "New Category" };

// Placeholder — replaced when the create form ships.
export default function Page({ searchParams }: PageProps<"/categories/new">) {
  return <EntityRecordPlaceholder entity="categories" kind="create" searchParams={searchParams} />;
}
