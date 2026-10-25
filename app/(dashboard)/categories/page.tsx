import type { Metadata } from "next";

import { EntityPage } from "@/components/dashboard/entities/entity-page";

export const metadata: Metadata = { title: "Categories" };

export default function Page() {
  return <EntityPage entity="categories" />;
}
