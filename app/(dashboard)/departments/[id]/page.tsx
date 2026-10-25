import type { Metadata } from "next";

import { EntityRecordPlaceholder } from "@/components/dashboard/entities/entity-record-placeholder";

export const metadata: Metadata = { title: "Department" };

// Placeholder — replaced when the detail view ships.
export default function Page({ params, searchParams }: PageProps<"/departments/[id]">) {
  return <EntityRecordPlaceholder entity="departments" kind="detail" params={params} searchParams={searchParams} />;
}
