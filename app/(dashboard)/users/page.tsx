import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/dashboard/module-placeholder";

export const metadata: Metadata = { title: "Users" };

// Placeholder — replaced when the Users module is built.
export default function Page() {
  return <ModulePlaceholder href="/users" />;
}
