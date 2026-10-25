import type { Metadata } from "next";

import { EntityRecordPlaceholder } from "@/components/dashboard/entities/entity-record-placeholder";

export const metadata: Metadata = { title: "Edit Collection" };

// Placeholder — replaced when the edit form ships.
export default function Page({ params, searchParams }: PageProps<"/collections/[id]/edit">) {
  return <EntityRecordPlaceholder entity="collections" kind="edit" params={params} searchParams={searchParams} />;
}
