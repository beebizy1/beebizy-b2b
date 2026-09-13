import { cn } from "@/lib/utils";

/** Official Tier 1 horizontal mark published by Santa Clara University. */
const SANTA_CLARA_LOGO_URL = "/santa-clara-university-logo.jpg";

export function SantaClaraLogo({ className }: { className?: string }) {
  return (
    <img
      src={SANTA_CLARA_LOGO_URL}
      alt="Santa Clara University"
      width={1801}
      height={646}
      decoding="async"
      className={cn("h-auto w-full object-contain", className)}
    />
  );
}
