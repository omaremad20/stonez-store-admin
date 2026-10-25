import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/dashboard/module-placeholder";

export const metadata: Metadata = { title: "Products" };

// Placeholder — replaced when the Products module is built.
export default function Page() {
  return <ModulePlaceholder href="/products" />;
}
