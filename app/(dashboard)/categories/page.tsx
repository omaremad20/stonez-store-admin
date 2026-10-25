import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/dashboard/module-placeholder";

export const metadata: Metadata = { title: "Categories" };

// Placeholder — replaced when the Categories module is built.
export default function Page() {
  return <ModulePlaceholder href="/categories" />;
}
