import { Suspense } from "react";

import { CommandSearch } from "@/components/dashboard/command-search";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { UserProfile, UserProfileSkeleton } from "@/components/dashboard/user-profile";

export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-sm supports-[backdrop-filter]:bg-background/85 sm:px-6 lg:px-10">
      <MobileNav />
      <div className="min-w-0 flex-1">
        <Suspense fallback={<UserProfileSkeleton />}>
          <UserProfile />
        </Suspense>
      </div>
      <CommandSearch />
    </header>
  );
}
