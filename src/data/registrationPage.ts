export const REGISTRATION_PAGE_TEMPLATE_IDS = ["warm", "garden", "coastal"] as const;
export type RegistrationPageTemplateId = (typeof REGISTRATION_PAGE_TEMPLATE_IDS)[number];

export interface RegistrationPageSettings {
  template: RegistrationPageTemplateId;
  accentColor: string;
  headline: string;
  welcomeMessage: string;
  heroImageUrl: string | null;
  showAgenda: boolean;
  showVolunteerSignup: boolean;
  registrationTypes: string[];
  collectOrganization: boolean;
}

export interface RegistrationPageTemplate {
  id: RegistrationPageTemplateId;
  name: string;
  description: string;
  accentColor: string;
  background: string;
  surface: string;
}

export const REGISTRATION_PAGE_TEMPLATES: readonly RegistrationPageTemplate[] = [
  {
    id: "warm",
    name: "Warm welcome",
    description: "Soft ivory, generous space, and a polished invitation feel.",
    accentColor: "#8C5A12",
    background: "#FFFCF3",
    surface: "#FFFFFF",
  },
  {
    id: "garden",
    name: "Garden",
    description: "Fresh greens and organic details for outdoor and community events.",
    accentColor: "#2F6B4F",
    background: "#F2F8F3",
    surface: "#FFFFFF",
  },
  {
    id: "coastal",
    name: "Coastal",
    description: "Airy blue tones for conferences, schools, and professional gatherings.",
    accentColor: "#276678",
    background: "#F1F8FA",
    surface: "#FFFFFF",
  },
] as const;

export const DEFAULT_REGISTRATION_PAGE: RegistrationPageSettings = {
  template: "warm",
  accentColor: "#8C5A12",
  headline: "",
  welcomeMessage: "",
  heroImageUrl: null,
  showAgenda: true,
  showVolunteerSignup: true,
  registrationTypes: ["General"],
  collectOrganization: true,
};

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeImageUrl(value: unknown): string | null {
  const candidate = text(value, 2_000);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function registrationTypes(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_REGISTRATION_PAGE.registrationTypes];
  const unique = new Set(
    value
      .map((item) => text(item, 40))
      .filter(Boolean),
  );
  const result = [...unique].slice(0, 8);
  return result.length > 0 ? result : [...DEFAULT_REGISTRATION_PAGE.registrationTypes];
}

export function normalizeRegistrationPage(value: unknown): RegistrationPageSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {
    ...DEFAULT_REGISTRATION_PAGE,
    registrationTypes: [...DEFAULT_REGISTRATION_PAGE.registrationTypes],
  };
  const input = value as Record<string, unknown>;
  const template = REGISTRATION_PAGE_TEMPLATE_IDS.includes(input.template as RegistrationPageTemplateId)
    ? (input.template as RegistrationPageTemplateId)
    : DEFAULT_REGISTRATION_PAGE.template;
  const templateDefaults = REGISTRATION_PAGE_TEMPLATES.find((item) => item.id === template)!;
  const accent = text(input.accentColor, 7).toUpperCase();

  return {
    template,
    accentColor: /^#[0-9A-F]{6}$/.test(accent) && contrastAgainstWhite(accent) >= 4.5
      ? accent
      : templateDefaults.accentColor,
    headline: text(input.headline, 120),
    welcomeMessage: text(input.welcomeMessage, 600),
    heroImageUrl: safeImageUrl(input.heroImageUrl),
    showAgenda: typeof input.showAgenda === "boolean" ? input.showAgenda : true,
    showVolunteerSignup: typeof input.showVolunteerSignup === "boolean" ? input.showVolunteerSignup : true,
    registrationTypes: registrationTypes(input.registrationTypes),
    collectOrganization: typeof input.collectOrganization === "boolean" ? input.collectOrganization : true,
  };
}

function contrastAgainstWhite(hex: string): number {
  const channels = [1, 3, 5].map((index) => {
    const component = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return component <= 0.04045 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return 1.05 / (luminance + 0.05);
}

export function registrationPageTemplate(id: RegistrationPageTemplateId): RegistrationPageTemplate {
  return REGISTRATION_PAGE_TEMPLATES.find((template) => template.id === id) ?? REGISTRATION_PAGE_TEMPLATES[0];
}
