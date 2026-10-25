import type { Metadata } from "next";

import { EntityRecordPlaceholder } from "@/components/dashboard/entities/entity-record-placeholder";

export const metadata: Metadata = { title: "Edit Brand" };

// Placeholder — replaced when the edit form ships.
export default function Page({ params, searchParams }: PageProps<"/brands/[id]/edit">) {
  return <EntityRecordPlaceholder entity="brands" kind="edit" params={params} searchParams={searchParams} />;
}
