import type { Metadata } from "next";

import { EntityRecordPlaceholder } from "@/components/dashboard/entities/entity-record-placeholder";

export const metadata: Metadata = { title: "Edit Category" };

// Placeholder — replaced when the edit form ships.
export default function Page({ params, searchParams }: PageProps<"/categories/[id]/edit">) {
  return <EntityRecordPlaceholder entity="categories" kind="edit" params={params} searchParams={searchParams} />;
}
