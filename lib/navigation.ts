import {
  ClipboardList,
  FolderTree,
  Heart,
  Images,
  Layers,
  LayoutDashboard,
  type LucideIcon,
  Package,
  Plus,
  Settings,
  Shapes,
  ShoppingCart,
  Tag,
  Users,
} from "lucide-react";

/**
 * `ready`        – module UI is implemented.
 * `placeholder`  – route exists so navigation works; the module is a later phase.
 */
export type ModuleStatus = "ready" | "placeholder";

export type NavGroupId = "general" | "catalog" | "sales" | "store";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  description: string;
  group: NavGroupId;
  status: ModuleStatus;
  /** Extra search terms for the command palette. */
  keywords?: readonly string[];
};

export const NAV_GROUP_LABELS: Record<NavGroupId, string | null> = {
  general: null,
  catalog: "Catalog",
  sales: "Customers & Sales",
  store: "Store",
};

/** Sidebar order is significant — it matches the agreed navigation order. */
export const DASHBOARD_NAV: readonly NavItem[] = [
  {
    title: "Overview",
    href: "/overview",
    icon: LayoutDashboard,
    description: "Your starting point for managing Stonez Store.",
    group: "general",
    status: "ready",
    keywords: ["home", "dashboard", "start"],
  },
  {
    title: "Departments",
    href: "/departments",
    icon: Layers,
    description: "Top-level store sections such as men's, women's and kids' wear.",
    group: "catalog",
    status: "placeholder",
    keywords: ["men", "women", "kids", "sections"],
  },
  {
    title: "Brands",
    href: "/brands",
    icon: Tag,
    description: "Brands carried by the store and their logos.",
    group: "catalog",
    status: "placeholder",
    keywords: ["labels", "manufacturers"],
  },
  {
    title: "Categories",
    href: "/categories",
    icon: FolderTree,
    description: "Product categories used to organise the catalog.",
    group: "catalog",
    status: "placeholder",
    keywords: ["taxonomy", "types"],
  },
  {
    title: "Collections",
    href: "/collections",
    icon: Shapes,
    description: "Curated and seasonal groupings of products.",
    group: "catalog",
    status: "placeholder",
    keywords: ["season", "drops", "curated"],
  },
  {
    title: "Products",
    href: "/products",
    icon: Package,
    description: "Products, variants, sizes, pricing and stock.",
    group: "catalog",
    status: "placeholder",
    keywords: ["items", "inventory", "variants", "stock", "sku"],
  },
  {
    title: "Users",
    href: "/users",
    icon: Users,
    description: "Customers and staff accounts.",
    group: "sales",
    status: "placeholder",
    keywords: ["customers", "staff", "employees", "admins", "accounts"],
  },
  {
    title: "Orders",
    href: "/orders",
    icon: ClipboardList,
    description: "Customer orders and their fulfilment status.",
    group: "sales",
    status: "placeholder",
    keywords: ["sales", "purchases", "fulfilment", "delivery"],
  },
  {
    title: "Carts",
    href: "/carts",
    icon: ShoppingCart,
    description: "Active shopping carts across the store.",
    group: "sales",
    status: "placeholder",
    keywords: ["basket", "abandoned"],
  },
  {
    title: "Favorites",
    href: "/favorites",
    icon: Heart,
    description: "Products customers have saved to their favorites.",
    group: "sales",
    status: "placeholder",
    keywords: ["wishlist", "saved", "likes"],
  },
  {
    title: "Photos",
    href: "/photos",
    icon: Images,
    description: "Uploaded product and brand imagery.",
    group: "store",
    status: "placeholder",
    keywords: ["images", "media", "gallery", "uploads"],
  },
  {
    title: "Store Settings",
    href: "/settings",
    icon: Settings,
    description: "Store-wide configuration and delivery settings.",
    group: "store",
    status: "placeholder",
    keywords: ["configuration", "preferences", "delivery", "fees"],
  },
];

export type DashboardAction = {
  id: string;
  title: string;
  href: string;
  icon: LucideIcon;
  /**
   * `available` – the destination route exists.
   * `planned`   – intended destination for a later phase; shown but disabled.
   */
  availability: "available" | "planned";
  keywords?: readonly string[];
};

function navItem(href: string): NavItem {
  const item = DASHBOARD_NAV.find((entry) => entry.href === href);
  if (!item) throw new Error(`Unknown dashboard route: ${href}`);
  return item;
}

function createAction(title: string, href: string): DashboardAction {
  return {
    id: `create-${href.slice(1)}`,
    title,
    href: `${href}/new`,
    icon: Plus,
    availability: "planned",
    keywords: ["new", "add", "create", ...(navItem(href).keywords ?? [])],
  };
}

function shortcutAction(title: string, href: string, keywords: readonly string[]): DashboardAction {
  const item = navItem(href);
  return {
    id: `goto-${href.slice(1)}`,
    title,
    href,
    icon: item.icon,
    availability: "available",
    keywords: [...keywords, ...(item.keywords ?? [])],
  };
}

export const DASHBOARD_ACTIONS: readonly DashboardAction[] = [
  createAction("Create Product", "/products"),
  createAction("Create Brand", "/brands"),
  createAction("Create Category", "/categories"),
  createAction("Create Collection", "/collections"),
  createAction("Create Department", "/departments"),
  shortcutAction("View Orders", "/orders", ["view", "list"]),
  shortcutAction("Manage Users", "/users", ["manage", "edit"]),
  shortcutAction("Manage Store Settings", "/settings", ["manage", "edit"]),
];

export function getNavItem(href: string): NavItem | undefined {
  return DASHBOARD_NAV.find((item) => item.href === href);
}

/**
 * Exact match or a true child segment: `/products` matches `/products/123`
 * but never `/products-archive`.
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
