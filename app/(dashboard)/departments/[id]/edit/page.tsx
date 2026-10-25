import type { Metadata } from "next";

import { EntityRecordPlaceholder } from "@/components/dashboard/entities/entity-record-placeholder";

export const metadata: Metadata = { title: "Edit Department" };

// Placeholder — replaced when the edit form ships.
export default function Page({ params, searchParams }: PageProps<"/departments/[id]/edit">) {
  return <EntityRecordPlaceholder entity="departments" kind="edit" params={params} searchParams={searchParams} />;
}
