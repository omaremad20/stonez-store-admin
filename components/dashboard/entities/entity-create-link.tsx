"use client";

import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { entityRoutes, type EntityConfig } from "@/lib/entities/config";

type Props = {
  config: EntityConfig;
  children: ReactNode;
  size?: "default" | "sm";
};

/**
 * "New …" link that carries the current listing URL in `?from=`, so Cancel or
 * a successful save returns to the same search, filters and sort.
 */
export function EntityCreateLink(props: Props) {
  return (
    <Suspense fallback={<CreateLink {...props} query="" />}>
      <CreateLinkWithState {...props} />
    </Suspense>
  );
}

function CreateLinkWithState(props: Props) {
  const query = useSearchParams().toString();
  return <CreateLink {...props} query={query} />;
}

function CreateLink({ config, children, size = "default", query }: Props & { query: string }) {
  const from = query ? `${config.href}?${query}` : null;
  const href = from ? `${entityRoutes(config).create}?from=${encodeURIComponent(from)}` : entityRoutes(config).create;
  return (
    <Link href={href} className={buttonVariants({ size })}>
      {children}
    </Link>
  );
}
