import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/dashboard/module-placeholder";

export const metadata: Metadata = { title: "Orders" };

// Placeholder — replaced when the Orders module is built.
export default function Page() {
  return <ModulePlaceholder href="/orders" />;
}
