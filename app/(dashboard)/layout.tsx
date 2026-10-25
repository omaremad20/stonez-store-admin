import { DashboardHeader } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { NavigationGuardProvider } from "@/components/dashboard/navigation-guard";
import { QueryProvider } from "@/components/providers/query-provider";

/**
 * Dashboard shell. Kept as a Server Component with a static shell: the only
 * session read (the profile card) streams in behind its own Suspense boundary,
 * as required with `cacheComponents`.
 */
export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <NavigationGuardProvider>
      <div className="flex min-h-dvh flex-col lg:pl-64">
        <Sidebar />
        <DashboardHeader />
        <main id="main-content" className="flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          <div className="mx-auto w-full max-w-7xl">
            <QueryProvider>{children}</QueryProvider>
          </div>
        </main>
      </div>
    </NavigationGuardProvider>
  );
}
