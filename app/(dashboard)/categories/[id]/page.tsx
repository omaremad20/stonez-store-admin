import type { Metadata } from "next";

import { EntityRecordPlaceholder } from "@/components/dashboard/entities/entity-record-placeholder";

export const metadata: Metadata = { title: "Category" };

// Placeholder — replaced when the detail view ships.
export default function Page({ params, searchParams }: PageProps<"/categories/[id]">) {
  return <EntityRecordPlaceholder entity="categories" kind="detail" params={params} searchParams={searchParams} />;
}
