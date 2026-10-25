import type { Metadata } from "next";

import { EntityPage } from "@/components/dashboard/entities/entity-page";

export const metadata: Metadata = { title: "Collections" };

export default function Page() {
  return <EntityPage entity="collections" />;
}
