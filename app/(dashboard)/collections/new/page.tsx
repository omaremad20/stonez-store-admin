import type { Metadata } from "next";

import { EntityRecordPlaceholder } from "@/components/dashboard/entities/entity-record-placeholder";

export const metadata: Metadata = { title: "New Collection" };

// Placeholder — replaced when the create form ships.
export default function Page({ searchParams }: PageProps<"/collections/new">) {
  return <EntityRecordPlaceholder entity="collections" kind="create" searchParams={searchParams} />;
}
