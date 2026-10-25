import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/dashboard/module-placeholder";

export const metadata: Metadata = { title: "Favorites" };

// Placeholder — replaced when the Favorites module is built.
export default function Page() {
  return <ModulePlaceholder href="/favorites" />;
}
