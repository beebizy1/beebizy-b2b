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

/** Null means an event predates the builder. Keep its already-shared segment links valid. */
export const LEGACY_REGISTRATION_PAGE: RegistrationPageSettings = {
  ...DEFAULT_REGISTRATION_PAGE,
  registrationTypes: ["Investor", "Company", "General", "Student"],
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
    ...LEGACY_REGISTRATION_PAGE,
    registrationTypes: [...LEGACY_REGISTRATION_PAGE.registrationTypes],
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

/** Pasteable email markup, deliberately self-contained for common email composers. */
export function registrationInvitationHtml(
  settings: RegistrationPageSettings,
  eventTitle: string,
  eventDescription: string | null,
  url: string,
): string {
  const page = normalizeRegistrationPage(settings);
  const template = registrationPageTemplate(page.template);
  const title = escapeHtml(page.headline || eventTitle);
  const welcome = escapeHtml(page.welcomeMessage || eventDescription || "We would love to see you there.");
  const link = escapeHtml(url);
  const hero = page.heroImageUrl
    ? `<img src="${escapeHtml(page.heroImageUrl)}" alt="" width="600" style="display:block;width:100%;max-height:280px;object-fit:cover;border:0;" />`
    : "";

  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${template.background};font-family:Arial,sans-serif;"><tr><td align="center" style="padding:32px 16px;"><table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:${template.surface};border-radius:16px;overflow:hidden;"><tr><td>${hero}</td></tr><tr><td style="padding:36px;"><p style="margin:0 0 16px;color:${page.accentColor};font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">You're invited</p><h1 style="margin:0 0 16px;color:#1E293B;font-size:32px;line-height:1.2;">${title}</h1><p style="margin:0 0 28px;color:#475569;font-size:16px;line-height:1.6;">${welcome}</p><a href="${link}" style="display:inline-block;padding:14px 22px;border-radius:8px;background:${page.accentColor};color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:700;">Register for ${escapeHtml(eventTitle)}</a><p style="margin:24px 0 0;color:#64748B;font-size:12px;line-height:1.5;">If the button does not work, visit <a href="${link}" style="color:${page.accentColor};">${link}</a>.</p></td></tr></table></td></tr></table>`;
}
