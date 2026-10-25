import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { LogoutButton } from "@/components/dashboard/logout-button";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { DEFAULT_AUTHENTICATED_PATH } from "@/lib/auth/redirect";

/** Persistent desktop sidebar. Mobile uses `MobileNav` (a sheet) instead. */
export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <SidebarBrand />
      <SidebarBody />
    </aside>
  );
}

export function SidebarBrand() {
  return (
    <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-6">
      <Link
        href={DEFAULT_AUTHENTICATED_PATH}
        className="outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50 focus-visible:ring-offset-4 focus-visible:ring-offset-sidebar"
      >
        <Logo className="h-6" />
        <span className="sr-only">Go to overview</span>
      </Link>
    </div>
  );
}

export function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5">
        <SidebarNav onNavigate={onNavigate} />
      </div>
      <div className="shrink-0 border-t border-sidebar-border px-3 py-3">
        <LogoutButton />
      </div>
    </>
  );
}
