/**
 * The Beebizy logo.
 *
 * This is the real asset — the hand-lettered wordmark with the bee and its flight path —
 * not a substitute. The rebuild had been drawing a generic hexagon in the chrome, which
 * threw away the one piece of the brand nobody could mistake for another product.
 *
 * It is a full lockup: mark plus wordmark. So nothing that uses it should print
 * "Beebizy" alongside it, and the alt text carries the name for anyone who can't see it.
 */

import { Link } from "wouter";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "h-7",
  md: "h-9",
  lg: "h-11",
  xl: "h-14 sm:h-16",
} as const;

export function BrandLogo({
  size = "md",
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    /*
      The wordmark is black on transparency, so on a dark surface it disappears and only
      the bee's yellow survives. It sits on a white plate in dark mode instead of being
      inverted — inverting would rotate the brand yellow to blue, which is worse than the
      problem it solves.
    */
    <span className={cn("inline-flex shrink-0 items-center dark:rounded-md dark:bg-white dark:px-2 dark:py-1", className)}>
      <img
        src="/beebizy-logo.png"
        alt="Beebizy"
        /* Intrinsic size of the asset, so the browser reserves the right box and the
           layout doesn't jump while it loads. */
        width={2198}
        height={1087}
        className={cn("w-auto object-contain", SIZES[size])}
      />
    </span>
  );
}

/** The logo as a link home. `to` differs between the marketing site and the app. */
export function BrandLogoLink({
  to = "/",
  size = "md",
  className,
}: {
  to?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <Link href={to} className={cn("inline-flex shrink-0 items-center rounded-md", className)} aria-label="Beebizy home">
      <BrandLogo size={size} />
    </Link>
  );
}
