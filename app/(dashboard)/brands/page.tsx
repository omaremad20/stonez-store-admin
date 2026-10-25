import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/dashboard/module-placeholder";

export const metadata: Metadata = { title: "Brands" };

// Placeholder — replaced when the Brands module is built.
export default function Page() {
  return <ModulePlaceholder href="/brands" />;
}
