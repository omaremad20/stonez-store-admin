"use client";

import { useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { ImagePlus, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { FieldControlProps } from "@/components/dashboard/entities/form-field";
import type { ImageValue } from "@/lib/entities/form-schema";
import { cn } from "@/lib/utils";

/** Raw files are re-encoded below the 1 MB bucket limit on save; this only stops absurd inputs. */
const RAW_MAX_BYTES = 15 * 1024 * 1024;

const ACCEPT = { "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "image/webp": [".webp"] };

type Props = {
  control: FieldControlProps;
  value: ImageValue;
  onChange: (value: ImageValue) => void;
  onReject: (message: string) => void;
  disabled?: boolean;
  label: string;
  /** Small square tile (e.g. one per variant row) instead of the 4:3 panel. */
  compact?: boolean;
};

function rejectionMessage(rejections: FileRejection[]) {
  const code = rejections[0]?.errors[0]?.code;
  if (code === "file-invalid-type") return "Use a PNG, JPEG or WebP image.";
  if (code === "file-too-large") return "This file is too large. Use an image under 15 MB.";
  if (code === "too-many-files") return "Choose a single image.";
  return "This file can't be used. Try another image.";
}

/**
 * Optional image. Nothing is uploaded here: the file is held in form state and
 * uploaded on save, so cancelling never leaves orphaned files in Storage.
 */
export function ImageField({ control, value, onChange, onReject, disabled, label, compact = false }: Props) {
  const previewUrl = value.kind === "new" ? value.previewUrl : value.kind === "existing" ? value.url : null;
  const [broken, setBroken] = useState<string | null>(null);

  // Free the previous local preview when it is replaced or removed. (Not in an
  // effect cleanup: Strict Mode re-runs effects and would revoke a live URL.)
  function change(next: ImageValue) {
    if (value.kind === "new") URL.revokeObjectURL(value.previewUrl);
    onChange(next);
  }

  const { getRootProps, getInputProps, open, isDragActive } = useDropzone({
    accept: ACCEPT,
    maxSize: RAW_MAX_BYTES,
    multiple: false,
    disabled,
    noClick: previewUrl !== null,
    noKeyboard: previewUrl !== null,
    onDrop: (accepted, rejected) => {
      if (rejected.length > 0) {
        onReject(rejectionMessage(rejected));
        return;
      }
      const file = accepted[0];
      if (file) change({ kind: "new", file, previewUrl: URL.createObjectURL(file) });
    },
  });

  const { id, ...aria } = control;

  if (compact) {
    const isBroken = previewUrl !== null && broken === previewUrl;
    return (
      <div className="flex items-center gap-2">
        <div
          {...getRootProps({
            className: cn(
              "relative flex size-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden border bg-muted/30 outline-none transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/40",
              previewUrl ? "border-border" : "border-dashed border-border",
              isDragActive && "border-foreground/50 bg-muted/60",
              disabled && "pointer-events-none opacity-50",
            ),
            role: "button",
            tabIndex: disabled ? -1 : 0,
            // Without an image the dropzone opens the picker itself; with one,
            // its click/keyboard handling is off (noClick), so the tile replaces.
            ...(previewUrl
              ? {
                  onClick: open,
                  onKeyDown: (event: React.KeyboardEvent) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      open();
                    }
                  },
                }
              : {}),
            "aria-label": previewUrl ? `${label}: replace image` : `${label}: choose an image`,
            "aria-describedby": aria["aria-describedby"],
          })}
        >
          <input {...getInputProps()} id={id} />
          {previewUrl && !isBroken ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob/object-storage preview
            <img src={previewUrl} alt="" className="size-full object-cover" onError={() => setBroken(previewUrl)} />
          ) : (
            <ImagePlus className="size-4 text-muted-foreground" aria-hidden />
          )}
          {value.kind === "new" && <span className="absolute inset-x-0 bottom-0 bg-background/90 text-center text-[0.5rem] font-medium uppercase">New</span>}
        </div>
        {previewUrl && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => change({ kind: "none" })}
            disabled={disabled}
            aria-label={`${label}: remove image`}
          >
            <Trash2 aria-hidden />
          </Button>
        )}
      </div>
    );
  }

  if (previewUrl) {
    const isBroken = broken === previewUrl;
    return (
      <div className="grid gap-3" {...getRootProps()}>
        <input {...getInputProps()} id={id} {...aria} aria-label={`${label}: replace image`} />
        <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden border border-border bg-muted/40">
          {isBroken ? (
            <p className="px-4 text-center text-xs text-muted-foreground">The current image couldn&apos;t be loaded.</p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- local blob/object-storage preview
            <img src={previewUrl} alt={`${label} preview`} className="size-full object-contain p-2" onError={() => setBroken(previewUrl)} />
          )}
          {value.kind === "new" && (
            <span className="absolute top-2 left-2 border border-border bg-background px-1.5 py-0.5 text-[0.625rem] font-medium tracking-wide uppercase">
              Uploads on save
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="flex-1" onClick={open} disabled={disabled}>
            <RefreshCw aria-hidden />
            Replace
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 hover:text-destructive"
            onClick={() => change({ kind: "none" })}
            disabled={disabled}
          >
            <Trash2 aria-hidden />
            Remove
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      {...getRootProps({
        className: cn(
          "flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-border bg-muted/20 px-4 text-center outline-none transition-colors hover:border-foreground/30 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/40",
          isDragActive && "border-foreground/50 bg-muted/60",
          disabled && "pointer-events-none opacity-50",
        ),
        role: "button",
        "aria-label": `${label}: choose an image`,
        "aria-describedby": aria["aria-describedby"],
      })}
    >
      <input {...getInputProps()} id={id} />
      <ImagePlus className="size-6 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">{isDragActive ? "Drop the image here" : "Drop an image or click to browse"}</p>
      <p className="text-xs text-muted-foreground">PNG, JPEG or WebP. Optimised to under 1 MB on save.</p>
    </div>
  );
}
