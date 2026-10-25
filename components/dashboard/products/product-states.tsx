import Link from "next/link";
import { PackageX, ShieldAlert } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const frame = "flex flex-col items-start gap-4 border border-dashed border-border px-6 py-14 sm:items-center sm:text-center";
const iconBox = "flex size-11 items-center justify-center border border-border bg-muted/40 text-muted-foreground";

export function ProductsAccessRequired() {
  return (
    <div className={frame}>
      <span className={iconBox}>
        <ShieldAlert className="size-5" aria-hidden />
      </span>
      <div className="grid max-w-md gap-1.5">
        <h2 className="text-base font-semibold">Administrator access required</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Only administrators can view and manage products. Ask the store administrator if you need access.
        </p>
      </div>
    </div>
  );
}

export function ProductNotFound({ backHref }: { backHref: string }) {
  return (
    <div className={frame}>
      <span className={iconBox}>
        <PackageX className="size-5" aria-hidden />
      </span>
      <div className="grid max-w-md gap-1.5">
        <h2 className="text-base font-semibold">This product doesn&apos;t exist</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">It may have been deleted, or the link is wrong.</p>
      </div>
      <Link href={backHref} className={buttonVariants({ size: "sm", variant: "outline" })}>
        Back to products
      </Link>
    </div>
  );
}

const block = "animate-pulse bg-muted";

/** Mirrors the details page: header, summary + images, information, variants table. */
export function ProductDetailsSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Loading product">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-3">
          <div className={cn(block, "h-2.5 w-20")} />
          <div className={cn(block, "h-8 w-72 max-w-full")} />
          <div className={cn(block, "h-3 w-56 bg-muted/70")} />
        </div>
        <div className="flex gap-2">
          <div className={cn(block, "h-10 w-28")} />
          <div className={cn(block, "h-10 w-24")} />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid content-start gap-6">
          <div className="grid gap-4 border border-border p-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="grid grid-cols-[8rem_1fr] gap-4">
                <div className={cn(block, "h-3 w-20")} />
                <div className={cn(block, "h-3", index % 2 ? "w-40" : "w-56")} />
              </div>
            ))}
          </div>
          <div className="border border-border">
            <div className="h-10 border-b border-border bg-muted/40" />
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex h-12 items-center gap-6 border-b border-border px-4 last:border-b-0">
                <div className={cn(block, "h-3 w-10")} />
                <div className={cn(block, "h-3 w-28")} />
                <div className={cn(block, "h-3 w-24")} />
                <div className={cn(block, "ml-auto h-3 w-10")} />
              </div>
            ))}
          </div>
        </div>
        <div className="grid content-start gap-6">
          <div className={cn(block, "aspect-square w-full")} />
          <div className={cn(block, "aspect-[4/3] w-full bg-muted/70")} />
        </div>
      </div>
    </div>
  );
}

/** Mirrors the product form: details / pricing / variants + side panels. */
export function ProductFormSkeleton() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" aria-busy="true" aria-label="Loading form">
      <div className="grid content-start gap-6">
        {[3, 2, 4].map((fields, section) => (
          <div key={section} className="border border-border">
            <div className="border-b border-border px-5 py-4">
              <div className={cn(block, "h-3.5 w-24")} />
              <div className={cn(block, "mt-2 h-2.5 w-64 max-w-full bg-muted/70")} />
            </div>
            <div className="grid gap-6 p-5 sm:grid-cols-2">
              {Array.from({ length: fields }).map((_, index) => (
                <div key={index} className={cn("grid gap-2", section === 0 && index === 2 && "sm:col-span-2")}>
                  <div className={cn(block, "h-3 w-20")} />
                  <div className={cn(block, section === 0 && index === 2 ? "h-28" : "h-9", "w-full")} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="grid content-start gap-6">
        <div className="border border-border p-5">
          <div className={cn(block, "h-3.5 w-20")} />
          <div className="mt-5 flex items-center justify-between">
            <div className={cn(block, "h-3 w-32")} />
            <div className={cn(block, "h-6 w-11 rounded-full")} />
          </div>
        </div>
        <div className="border border-border p-5">
          <div className={cn(block, "h-3.5 w-16")} />
          <div className={cn(block, "mt-5 aspect-[4/3] w-full")} />
        </div>
        <div className="border border-border p-5">
          <div className={cn(block, "h-3.5 w-24")} />
          <div className={cn(block, "mt-5 aspect-[4/3] w-full")} />
        </div>
      </div>
    </div>
  );
}
