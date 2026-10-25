import Image from "next/image";

import { cn } from "@/lib/utils";

import horizontalLogo from "@/public/brand/horizontal-logo.webp";

type LogoProps = {
  className?: string;
  /** Render white on dark surfaces (the source asset is black on transparent). */
  inverted?: boolean;
  priority?: boolean;
};

export function Logo({ className, inverted = false, priority = false }: LogoProps) {
  return (
    <Image
      src={horizontalLogo}
      alt="Stonez Store, Cairo"
      priority={priority}
      className={cn("h-7 w-auto max-w-none self-start", inverted && "invert", className)}
    />
  );
}
