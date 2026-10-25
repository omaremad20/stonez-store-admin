import type { Metadata } from "next";

import { EntityRecordPlaceholder } from "@/components/dashboard/entities/entity-record-placeholder";

export const metadata: Metadata = { title: "New Department" };

// Placeholder — replaced when the create form ships.
export default function Page({ searchParams }: PageProps<"/departments/new">) {
  return <EntityRecordPlaceholder entity="departments" kind="create" searchParams={searchParams} />;
}
