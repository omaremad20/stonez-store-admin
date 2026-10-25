import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/dashboard/module-placeholder";

export const metadata: Metadata = { title: "Carts" };

// Placeholder — replaced when the Carts module is built.
export default function Page() {
  return <ModulePlaceholder href="/carts" />;
}
