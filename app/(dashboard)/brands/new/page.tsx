import type { Metadata } from "next";

import { EntityRecordPlaceholder } from "@/components/dashboard/entities/entity-record-placeholder";

export const metadata: Metadata = { title: "New Brand" };

// Placeholder — replaced when the create form ships.
export default function Page({ searchParams }: PageProps<"/brands/new">) {
  return <EntityRecordPlaceholder entity="brands" kind="create" searchParams={searchParams} />;
}
