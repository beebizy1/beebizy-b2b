/**
 * Clerk's components, dressed in the product's own tokens.
 *
 * Clerk ships its own palette. Left alone, the sign-in card is the one screen in the
 * product that isn't Beebizy — a different yellow, a different radius, a different font.
 * Mapping its variables onto the CSS custom properties means it follows the brand and
 * flips with dark mode for free, since the tokens already do.
 */

import type { ClerkAppearanceTheme } from "@clerk/shared/types";

export const clerkAppearance: ClerkAppearanceTheme = {
  /*
    Core 3 renamed these: colorText became colorForeground, colorTextOnPrimaryBackground
    became colorPrimaryForeground, colorInputBackground became colorInput, and so on. The
    pre-Core-3 names type-check as excess properties and are silently ignored at runtime,
    so a stale mapping looks fine and does nothing.
  */
  variables: {
    colorPrimary: "hsl(var(--primary))",
    colorPrimaryForeground: "hsl(var(--primary-foreground))",
    colorBackground: "hsl(var(--card))",
    colorForeground: "hsl(var(--foreground))",
    colorMuted: "hsl(var(--muted))",
    colorMutedForeground: "hsl(var(--muted-foreground))",
    colorInput: "hsl(var(--surface))",
    colorInputForeground: "hsl(var(--foreground))",
    colorBorder: "hsl(var(--border))",
    colorRing: "hsl(var(--ring))",
    colorDanger: "hsl(var(--danger))",
    colorSuccess: "hsl(var(--success))",
    colorWarning: "hsl(var(--warning))",
    colorNeutral: "hsl(var(--foreground))",
    fontFamily: "var(--app-font-sans)",
    fontFamilyMono: "var(--app-font-mono)",
    borderRadius: "var(--radius)",
  },
  elements: {
    // Clerk's own card chrome would double up with ours.
    card: "shadow-sm border border-card-border",
    headerTitle: "text-foreground",
    headerSubtitle: "text-muted-foreground",
    formButtonPrimary: "font-semibold",
    footerActionLink: "font-semibold",
    // Clerk's "Secured by" footer stays. The override didn't take effect on Core 3, and
    // the free plan requires the attribution anyway — stripping it would breach the terms.
  },
};
