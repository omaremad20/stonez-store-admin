"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Barcode, ImageOff, Lock, Pencil, Printer, ShoppingCart } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { useGuardedNavigation } from "@/components/dashboard/navigation-guard";
import { EntityErrorState } from "@/components/dashboard/entities/entity-states";
import { StatusBadge } from "@/components/dashboard/entities/status-badge";
import { ProductBarcodeDialog } from "@/components/dashboard/products/barcode/product-barcode-dialog";
import { ColorSwatch } from "@/components/dashboard/products/color-swatch";
import { ProductDeleteDialog } from "@/components/dashboard/products/product-delete-dialog";
import { ProductLabelBadge } from "@/components/dashboard/products/product-label-badge";
import { ProductRowActions } from "@/components/dashboard/products/product-row-actions";
import { ProductDetailsSkeleton, ProductNotFound } from "@/components/dashboard/products/product-states";
import { ProductVisibilityDialog } from "@/components/dashboard/products/product-visibility-dialog";
import { toEntityError } from "@/lib/entities/errors";
import { BARCODE_PATTERN, productRoutes } from "@/lib/products/constants";
import { discountedPrice, formatCount, formatDate, formatPrice } from "@/lib/products/format";
import { productKeys, useProductDetail, useProductMutations } from "@/lib/products/hooks";
import type { ProductDetail, ProductVariant, RelationRef } from "@/lib/products/types";
import { cn } from "@/lib/utils";

type DialogKind = "visibility" | "delete" | "barcode";

/** /products/[id]: everything about one product, its variants and its actions. */
export function ProductDetails({ id, backHref }: { id: string; backHref: string }) {
  const detail = useProductDetail(id);
  const { visibility, remove, reorder } = useProductMutations();
  const { navigate } = useGuardedNavigation();

  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [barcodeVariantId, setBarcodeVariantId] = useState<string | null>(null);
  useLayoutEffect(() => () => setDialog(null), []);

  if (detail.isPending) return <ProductDetailsSkeleton />;
  if (detail.isError) {
    const error = toEntityError(detail.error);
    if (error.code === "not_found") return <ProductNotFound backHref={backHref} />;
    return (
      <EntityErrorState
        message={error.message}
        canRetry={!error.isPermanent}
        isRetrying={detail.isFetching}
        onRetry={() => void detail.refetch()}
      />
    );
  }

  const product = detail.data;
  const here = `${productRoutes.detail(product.id)}${backHref !== "/products" ? `?from=${encodeURIComponent(backHref)}` : ""}`;
  const editHref = `${productRoutes.edit(product.id)}?from=${encodeURIComponent(here)}`;
  const open = (kind: DialogKind) => {
    visibility.reset();
    remove.reset();
    setDialog(kind);
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mb-2 text-[0.6875rem] font-semibold tracking-[0.24em] text-muted-foreground uppercase">Product</p>
          <h1 className="text-2xl font-semibold tracking-tight text-balance break-words sm:text-3xl">{product.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge active={product.isActive} />
            {product.label && <ProductLabelBadge label={product.label} color={product.labelColor} background={product.labelBg} className="h-6" />}
            <span className="text-xs text-muted-foreground">
              {product.variants.length} {product.variants.length === 1 ? "variant" : "variants"}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link href={editHref} className={buttonVariants()}>
            <Pencil aria-hidden />
            Edit
          </Link>
          <Button variant="outline" onClick={() => open("barcode")}>
            <Barcode aria-hidden />
            Barcode
          </Button>
          <ProductRowActions
            trigger="button"
            item={product}
            editHref={editHref}
            onBarcode={() => open("barcode")}
            onToggleVisibility={() => open("visibility")}
            onDelete={() => open("delete")}
            moveDisabled={reorder.isPending}
            onMove={(position) =>
              reorder.mutate({ id: product.id, targetId: null, position, listKey: productKeys.lists(), toIndex: position === "first" ? 0 : "end-or-remove" })
            }
          />
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6">
          <Panel title="Overview">
            <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
              <Item term="Price">
                <span className="font-medium tabular-nums">{formatPrice(discountedPrice(product.price, product.discount))}</span>
                {product.discount > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                    <s>{formatPrice(product.price)}</s> −{product.discount}%
                  </span>
                )}
              </Item>
              <Item term="Discount">{product.discount > 0 ? `${product.discount}%` : "None"}</Item>
              <Item term="Department">
                <Relation value={product.department} empty={product.category ? "Category has no department" : "—"} />
              </Item>
              <Item term="Category">
                <Relation value={product.category} empty="No category" />
              </Item>
              <Item term="Brand">
                <Relation value={product.brand} empty="No brand" />
              </Item>
              <Item term="Collection">
                <Relation value={product.collection} empty="No collection" />
              </Item>
              <Item term="Store order">
                {product.position ? (
                  <>
                    {formatCount(product.position.rank)} of {formatCount(product.position.total)}
                    {product.displayOrder === null && <span className="ml-1 text-xs text-muted-foreground">(not placed yet — listed after ordered products)</span>}
                  </>
                ) : (
                  "—"
                )}
              </Item>
              <Item term="Storefront label">
                {product.label ? <ProductLabelBadge label={product.label} color={product.labelColor} background={product.labelBg} /> : "None"}
              </Item>
              <Item term="Created">
                <DateValue value={product.createdAt} by={product.createdByEmail} />
              </Item>
              <Item term="Last updated">
                <DateValue value={product.updatedAt} by={product.lastUpdatedByEmail} />
              </Item>
            </dl>
          </Panel>

          <Panel title="Description">
            {product.description ? (
              <p className="text-sm leading-relaxed whitespace-pre-line">{product.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No description.</p>
            )}
          </Panel>

          <VariantsPanel
            product={product}
            editHref={editHref}
            onPrint={(variantId) => {
              setBarcodeVariantId(variantId);
              open("barcode");
            }}
          />
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6">
          <ImagePanel title="Cover image" url={product.coverImageUrl} alt={`${product.name} cover`} aspect="aspect-square" />
          <ImagePanel title="Size table" url={product.sizeTableImageUrl} alt={`${product.name} size table`} aspect="aspect-[4/3]" />
        </div>
      </div>

      <ProductVisibilityDialog
        item={product}
        open={dialog === "visibility"}
        isPending={visibility.isPending}
        error={visibility.error ? toEntityError(visibility.error).message : null}
        onOpenChange={(next) => !next && setDialog(null)}
        onConfirm={(item, nextActive) =>
          visibility.mutate({ id: item.id, name: item.name, isActive: nextActive }, { onSuccess: () => setDialog(null) })
        }
      />
      <ProductDeleteDialog
        item={product}
        open={dialog === "delete"}
        isPending={remove.isPending}
        error={remove.error ? toEntityError(remove.error).message : null}
        onOpenChange={(next) => !next && setDialog(null)}
        onConfirm={(item) =>
          remove.mutate(
            { id: item.id, name: item.name },
            {
              onSuccess: () => {
                setDialog(null);
                navigate(backHref);
              },
            },
          )
        }
        onHideInstead={() => open("visibility")}
      />
      <ProductBarcodeDialog
        product={product}
        open={dialog === "barcode"}
        initialVariantId={barcodeVariantId}
        onOpenChange={(next) => {
          if (!next) {
            setDialog(null);
            setBarcodeVariantId(null);
          }
        }}
      />
    </div>
  );
}

/* --------------------------------------------------------------- pieces */

function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  const headingId = `panel-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section className="min-w-0 border border-border bg-background" aria-labelledby={headingId}>
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 id={headingId} className="text-sm font-semibold">
          {title}
        </h2>
        {actions}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function Item({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1">
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Relation({ value, empty }: { value: RelationRef | null; empty: string }) {
  if (!value) return <span className="text-muted-foreground">{empty}</span>;
  return (
    <span>
      {value.name}
      {!value.isActive && <span className="ml-1.5 text-xs text-muted-foreground">(hidden)</span>}
    </span>
  );
}

function DateValue({ value, by }: { value: string; by: string }) {
  const date = formatDate(value);
  return (
    <span className="grid">
      <time dateTime={value} title={date.full} className="tabular-nums">
        {date.full || date.short}
      </time>
      {by && <span className="truncate text-xs text-muted-foreground">by {by}</span>}
    </span>
  );
}

function ImagePanel({ title, url, alt, aspect }: { title: string; url: string | null; alt: string; aspect: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <Panel title={title}>
      <div className={cn("flex items-center justify-center overflow-hidden border border-border bg-muted/40", aspect)}>
        {url && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element -- public object-storage image
          <img src={url} alt={alt} className="size-full object-contain p-2" onError={() => setBroken(true)} loading="lazy" />
        ) : (
          <span className="flex flex-col items-center gap-2 px-4 text-center text-xs text-muted-foreground">
            <ImageOff className="size-5" aria-hidden />
            {url ? "The image couldn't be loaded." : "No image"}
          </span>
        )}
      </div>
    </Panel>
  );
}

function lockLabel(variant: ProductVariant) {
  if (variant.lockReason === "printed_and_in_cart") return "Printed · in a cart";
  if (variant.lockReason === "printed") return "Printed";
  if (variant.lockReason === "in_cart") return "In a cart";
  return null;
}

function VariantsPanel({ product, editHref, onPrint }: { product: ProductDetail; editHref: string; onPrint: (variantId: string) => void }) {
  const totalStock = product.variants.reduce((sum, variant) => sum + variant.stock, 0);
  return (
    <Panel
      title="Variants"
      actions={
        product.variants.length > 0 ? (
          <span className="text-xs text-muted-foreground tabular-nums">Total stock {formatCount(totalStock)}</span>
        ) : undefined
      }
    >
      {product.variants.length === 0 ? (
        <div className="flex flex-col items-start gap-3 border border-dashed border-border px-4 py-8 text-sm sm:items-center sm:text-center">
          <p className="font-medium">No variants yet</p>
          <p className="text-muted-foreground">Customers can only buy this product once it has at least one size and colour.</p>
          <Link href={editHref} className={buttonVariants({ size: "sm", variant: "outline" })}>
            Add variants
          </Link>
        </div>
      ) : (
        <div className="-mx-4 -my-4 overflow-x-auto sm:-mx-5 sm:-my-5">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <caption className="sr-only">Variants of {product.name}</caption>
            <thead className="border-b border-border bg-muted/40">
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="h-10 w-14 px-4 font-medium sm:px-5">
                  <span className="sr-only">Image</span>
                </th>
                <th scope="col" className="px-3 font-medium">Size</th>
                <th scope="col" className="px-3 font-medium">Colour</th>
                <th scope="col" className="px-3 font-medium">Barcode</th>
                <th scope="col" className="px-3 text-right font-medium">Stock</th>
                <th scope="col" className="px-3 font-medium">Pre-orders</th>
                <th scope="col" className="px-3 font-medium">Status</th>
                <th scope="col" className="px-4 text-right font-medium sm:px-5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((variant) => {
                const lock = lockLabel(variant);
                return (
                  <tr key={variant.id} className="h-14 border-b border-border last:border-b-0">
                    <td className="px-4 sm:px-5">
                      <span className="flex size-9 items-center justify-center overflow-hidden border border-border bg-muted/40">
                        {variant.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- public object-storage image
                          <img src={variant.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
                        ) : (
                          <ColorSwatch hex={variant.colorHash} className="size-5" />
                        )}
                      </span>
                    </td>
                    <td className="px-3 font-medium">{variant.size}</td>
                    <td className="px-3">
                      <span className="flex items-center gap-2">
                        <ColorSwatch hex={variant.colorHash} />
                        <span className="grid leading-tight">
                          <span>{variant.colorName}</span>
                          <span className="font-mono text-[0.6875rem] text-muted-foreground uppercase">{variant.colorHash}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 font-mono text-xs tabular-nums">
                      {BARCODE_PATTERN.test(variant.barcode) ? variant.barcode : <span className="text-destructive">Invalid</span>}
                    </td>
                    <td className={cn("px-3 text-right tabular-nums", variant.stock <= 0 && "text-amber-700 dark:text-amber-400")}>
                      {formatCount(variant.stock)}
                    </td>
                    <td className="px-3 text-xs">
                      {variant.preorderEnabled ? `Up to ${formatCount(variant.maximumPreorderQuantity)}` : <span className="text-muted-foreground">Off</span>}
                    </td>
                    <td className="px-3">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge active={variant.isActive} className="h-5 text-[0.6875rem]" />
                        {lock && (
                          <span
                            className="inline-flex h-5 items-center gap-1 border border-border px-1.5 text-[0.6875rem] text-muted-foreground"
                            title="Barcode, size and colour are locked"
                          >
                            {variant.lockReason === "in_cart" ? <ShoppingCart className="size-3" aria-hidden /> : <Lock className="size-3" aria-hidden />}
                            {lock}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 text-right sm:px-5">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => onPrint(variant.id)}
                        disabled={!BARCODE_PATTERN.test(variant.barcode)}
                        aria-label={`Print label for ${variant.size} ${variant.colorName}`}
                      >
                        <Printer aria-hidden />
                        Label
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
