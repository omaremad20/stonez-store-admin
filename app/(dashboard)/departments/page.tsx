import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/dashboard/module-placeholder";

export const metadata: Metadata = { title: "Departments" };

// Placeholder — replaced when the Departments module is built.
export default function Page() {
  return <ModulePlaceholder href="/departments" />;
}
