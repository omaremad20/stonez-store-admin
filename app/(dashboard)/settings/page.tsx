import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/dashboard/module-placeholder";

export const metadata: Metadata = { title: "Store Settings" };

// Placeholder — replaced when the Store Settings module is built.
export default function Page() {
  return <ModulePlaceholder href="/settings" />;
}
