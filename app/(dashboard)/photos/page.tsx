import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/dashboard/module-placeholder";

export const metadata: Metadata = { title: "Photos" };

// Placeholder — replaced when the Photos module is built.
export default function Page() {
  return <ModulePlaceholder href="/photos" />;
}
