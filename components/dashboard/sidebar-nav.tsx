"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { DASHBOARD_NAV, isNavItemActive, NAV_GROUP_LABELS, type NavGroupId, type NavItem } from "@/lib/navigation";

const groups = DASHBOARD_NAV.reduce<{ id: NavGroupId; items: NavItem[] }[]>((acc, item) => {
  const last = acc.at(-1);
  if (last?.id === item.group) last.items.push(item);
  else acc.push({ id: item.group, items: [item] });
  return acc;
}, []);

export const navItemClassName =
  "group/nav relative flex h-9 w-full items-center gap-3 px-3 text-sm font-medium text-sidebar-foreground/70 transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/50 focus-visible:ring-inset";

type SidebarNavProps = {
  /** Called after a link is chosen — used to close the mobile sheet. */
  onNavigate?: () => void;
};

/**
 * On dynamic routes (e.g. `/brands/[id]`) the pathname is request data, which
 * Cache Components requires behind Suspense. The fallback is the same nav
 * without an active highlight, so the static shell never shifts.
 */
export function SidebarNav(props: SidebarNavProps) {
  return (
    <Suspense fallback={<NavList {...props} pathname={null} />}>
      <ActiveSidebarNav {...props} />
    </Suspense>
  );
}

function ActiveSidebarNav(props: SidebarNavProps) {
  const pathname = usePathname();
  return <NavList {...props} pathname={pathname} />;
}

function NavList({ onNavigate, pathname }: SidebarNavProps & { pathname: string | null }) {
  return (
    <nav aria-label="Dashboard" className="grid gap-5">
      {groups.map((group) => {
        const label = NAV_GROUP_LABELS[group.id];
        return (
          <div key={group.id} className="grid gap-0.5">
            {label && (
              <p className="px-3 pb-1.5 text-[0.625rem] font-semibold tracking-[0.22em] text-sidebar-foreground/45 uppercase">
                {label}
              </p>
            )}
            <ul className="grid gap-0.5">
              {group.items.map((item) => {
                const active = pathname !== null && isNavItemActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        navItemClassName,
                        active &&
                          "bg-sidebar-accent text-sidebar-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:bg-sidebar-primary"
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-4 shrink-0 text-sidebar-foreground/50 transition-colors group-hover/nav:text-sidebar-foreground",
                          active && "text-sidebar-foreground"
                        )}
                        strokeWidth={active ? 2.25 : 1.75}
                        aria-hidden
                      />
                      <span className="truncate">{item.title}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
