import type { Metadata } from "next";

import { EntityRecordPlaceholder } from "@/components/dashboard/entities/entity-record-placeholder";

export const metadata: Metadata = { title: "Brand" };

// Placeholder — replaced when the detail view ships.
export default function Page({ params, searchParams }: PageProps<"/brands/[id]">) {
  return <EntityRecordPlaceholder entity="brands" kind="detail" params={params} searchParams={searchParams} />;
}
