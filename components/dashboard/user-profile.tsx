import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getDashboardUser } from "@/lib/auth/dal";

function getInitials(name: string | null, email: string | null): string {
  const source = name ?? email?.split("@")[0] ?? "";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const initials = parts.length > 1 ? `${parts[0][0]}${parts.at(-1)![0]}` : source.slice(0, 2);
  return initials.toUpperCase() || "S";
}

/** Reads the verified session — render inside a <Suspense> boundary. */
export async function UserProfile() {
  const user = await getDashboardUser();
  const displayName = user.name ?? user.email?.split("@")[0] ?? "Staff member";

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-9 ring-1 ring-border">
        {user.avatarUrl && (
          <AvatarImage src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />
        )}
        <AvatarFallback delay={user.avatarUrl ? 300 : 0}>
          {getInitials(user.name, user.email)}
        </AvatarFallback>
      </Avatar>
      <div className="grid min-w-0 leading-tight">
        <span className="truncate text-sm font-semibold" title={displayName}>
          {displayName}
        </span>
        {user.email && (
          <span className="truncate text-xs text-muted-foreground" title={user.email}>
            {user.email}
          </span>
        )}
      </div>
    </div>
  );
}

export function UserProfileSkeleton() {
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <div className="size-9 shrink-0 animate-pulse rounded-full bg-muted" />
      <div className="grid gap-1.5">
        <div className="h-3 w-28 animate-pulse bg-muted" />
        <div className="h-2.5 w-36 animate-pulse bg-muted" />
      </div>
    </div>
  );
}
