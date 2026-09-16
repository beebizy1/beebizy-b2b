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
    accentColor: "#B7791F",
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
  accentColor: "#B7791F",
  headline: "",
  welcomeMessage: "",
  heroImageUrl: null,
  showAgenda: true,
  showVolunteerSignup: true,
};

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeImageUrl(value: unknown): string | null {
  const candidate = text(value, 2_000);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeRegistrationPage(value: unknown): RegistrationPageSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_REGISTRATION_PAGE };
  const input = value as Record<string, unknown>;
  const template = REGISTRATION_PAGE_TEMPLATE_IDS.includes(input.template as RegistrationPageTemplateId)
    ? (input.template as RegistrationPageTemplateId)
    : DEFAULT_REGISTRATION_PAGE.template;
  const templateDefaults = REGISTRATION_PAGE_TEMPLATES.find((item) => item.id === template)!;
  const accent = text(input.accentColor, 7).toUpperCase();

  return {
    template,
    accentColor: /^#[0-9A-F]{6}$/.test(accent) ? accent : templateDefaults.accentColor,
    headline: text(input.headline, 120),
    welcomeMessage: text(input.welcomeMessage, 600),
    heroImageUrl: safeImageUrl(input.heroImageUrl),
    showAgenda: typeof input.showAgenda === "boolean" ? input.showAgenda : true,
    showVolunteerSignup: typeof input.showVolunteerSignup === "boolean" ? input.showVolunteerSignup : true,
  };
}

export function registrationPageTemplate(id: RegistrationPageTemplateId): RegistrationPageTemplate {
  return REGISTRATION_PAGE_TEMPLATES.find((template) => template.id === id) ?? REGISTRATION_PAGE_TEMPLATES[0];
}
