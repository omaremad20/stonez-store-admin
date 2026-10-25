import type { Metadata } from "next";

import { EntityRecordPlaceholder } from "@/components/dashboard/entities/entity-record-placeholder";

export const metadata: Metadata = { title: "Collection" };

// Placeholder — replaced when the detail view ships.
export default function Page({ params, searchParams }: PageProps<"/collections/[id]">) {
  return <EntityRecordPlaceholder entity="collections" kind="detail" params={params} searchParams={searchParams} />;
}
