import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/dashboard/module-placeholder";

export const metadata: Metadata = { title: "Collections" };

// Placeholder — replaced when the Collections module is built.
export default function Page() {
  return <ModulePlaceholder href="/collections" />;
}
