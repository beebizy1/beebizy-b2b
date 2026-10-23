export const REGISTRATION_PAGE_TEMPLATE_IDS = ["warm", "garden", "coastal"] as const;
export type RegistrationPageTemplateId = (typeof REGISTRATION_PAGE_TEMPLATE_IDS)[number];
export type RegistrationHeroDisplay = "banner" | "logo";

export interface RegistrationSpeaker {
  id: string;
  name: string;
  title: string;
  organization: string;
  bio: string;
  photoUrl: string | null;
}

export interface RegistrationPageSettings {
  template: RegistrationPageTemplateId;
  accentColor: string;
  headline: string;
  aboutHeading: string;
  aboutBody: string;
  agendaIntroduction: string;
  welcomeMessage: string;
  heroImageUrl: string | null;
  heroImageDisplay: RegistrationHeroDisplay;
  aboutImageUrl: string | null;
  agendaImageUrl: string | null;
  /** Optional organizer-owned checkout. Beebizy does not process this payment. */
  paymentUrl?: string | null;
  showAgenda: boolean;
  showSpeakers: boolean;
  showSponsors: boolean;
  showVolunteerSignup: boolean;
  speakers: RegistrationSpeaker[];
  registrationTypes: string[];
  collectOrganization: boolean;
  postEventSubject: string;
  postEventThankYou: string;
  postEventWrapUp: string;
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
  aboutHeading: "",
  aboutBody: "",
  agendaIntroduction: "",
  welcomeMessage: "",
  heroImageUrl: null,
  heroImageDisplay: "banner",
  aboutImageUrl: null,
  agendaImageUrl: null,
  paymentUrl: null,
  showAgenda: true,
  showSpeakers: true,
  showSponsors: true,
  showVolunteerSignup: true,
  speakers: [],
  registrationTypes: ["General"],
  collectOrganization: true,
  postEventSubject: "",
  postEventThankYou: "",
  postEventWrapUp: "",
};

/** Null means an event predates the builder. Use a neutral public label until the client customizes it. */
export const LEGACY_REGISTRATION_PAGE: RegistrationPageSettings = {
  ...DEFAULT_REGISTRATION_PAGE,
  registrationTypes: ["General"],
};

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeImageUrl(value: unknown): string | null {
  const candidate = text(value, 2_000);
  if (!candidate) return null;
  if (candidate.startsWith("/") && !candidate.startsWith("//")) return candidate;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function speakers(value: unknown): RegistrationSpeaker[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index): RegistrationSpeaker[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const input = item as Record<string, unknown>;
    const name = text(input.name, 120);
    if (!name) return [];
    return [{
      id: text(input.id, 80) || `speaker-${index + 1}`,
      name,
      title: text(input.title, 120),
      organization: text(input.organization, 120),
      bio: text(input.bio, 500),
      photoUrl: safeImageUrl(input.photoUrl),
    }];
  }).slice(0, 8);
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
    aboutHeading: text(input.aboutHeading, 160),
    aboutBody: text(input.aboutBody, 3_000),
    agendaIntroduction: text(input.agendaIntroduction, 1_500),
    welcomeMessage: text(input.welcomeMessage, 2_000),
    heroImageUrl: safeImageUrl(input.heroImageUrl),
    heroImageDisplay: input.heroImageDisplay === "logo" ? "logo" : "banner",
    aboutImageUrl: safeImageUrl(input.aboutImageUrl),
    agendaImageUrl: safeImageUrl(input.agendaImageUrl),
    ...(Object.hasOwn(input, "paymentUrl") ? { paymentUrl: safeImageUrl(input.paymentUrl) } : {}),
    showAgenda: typeof input.showAgenda === "boolean" ? input.showAgenda : true,
    showSpeakers: typeof input.showSpeakers === "boolean" ? input.showSpeakers : true,
    showSponsors: typeof input.showSponsors === "boolean" ? input.showSponsors : true,
    showVolunteerSignup: typeof input.showVolunteerSignup === "boolean" ? input.showVolunteerSignup : true,
    speakers: speakers(input.speakers),
    registrationTypes: registrationTypes(input.registrationTypes),
    collectOrganization: typeof input.collectOrganization === "boolean" ? input.collectOrganization : true,
    postEventSubject: text(input.postEventSubject, 160),
    postEventThankYou: text(input.postEventThankYou, 3_000),
    postEventWrapUp: text(input.postEventWrapUp, 4_000),
  };
}

const REGISTRATION_PAGE_KEYS: readonly (keyof RegistrationPageSettings)[] = [
  "template", "accentColor", "headline", "aboutHeading", "aboutBody", "agendaIntroduction", "welcomeMessage",
  "heroImageUrl", "heroImageDisplay", "aboutImageUrl", "agendaImageUrl", "paymentUrl", "showAgenda", "showSpeakers", "showSponsors",
  "showVolunteerSignup", "speakers", "registrationTypes", "collectOrganization", "postEventSubject",
  "postEventThankYou", "postEventWrapUp",
];

/** Validates only supplied fields so independent editors cannot overwrite one another. */
export function normalizeRegistrationPagePatch(value: unknown): Partial<RegistrationPageSettings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const normalized = normalizeRegistrationPage({ ...DEFAULT_REGISTRATION_PAGE, ...input });
  const patch: Record<string, unknown> = {};
  for (const key of REGISTRATION_PAGE_KEYS) {
    if (Object.hasOwn(input, key)) patch[key] = normalized[key];
  }
  return patch as Partial<RegistrationPageSettings>;
}

export function registrationPageIsCustomized(value: unknown): boolean {
  const page = normalizeRegistrationPage(value);
  return page.template !== DEFAULT_REGISTRATION_PAGE.template ||
    page.accentColor !== DEFAULT_REGISTRATION_PAGE.accentColor ||
    Boolean(page.headline || page.aboutHeading || page.aboutBody || page.agendaIntroduction || page.welcomeMessage || page.heroImageUrl || page.aboutImageUrl || page.agendaImageUrl) ||
    page.speakers.length > 0 ||
    page.registrationTypes.join("\u0000") !== DEFAULT_REGISTRATION_PAGE.registrationTypes.join("\u0000");
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
  recipientName?: string,
  organizationName = "Beebizy",
): string {
  const page = normalizeRegistrationPage(settings);
  const template = registrationPageTemplate(page.template);
  const title = escapeHtml(page.headline || eventTitle);
  const welcome = escapeHtml(page.welcomeMessage || eventDescription || "We would love to see you there.").replace(/\r?\n/g, "<br />");
  const link = escapeHtml(url);
  const hero = page.heroImageUrl
    ? page.heroImageDisplay === "logo"
      ? `<div style="padding:28px;text-align:center;background:${template.background};"><img src="${escapeHtml(page.heroImageUrl)}" alt="Event logo" width="180" style="display:inline-block;width:auto;max-width:180px;max-height:100px;object-fit:contain;border:0;" /></div>`
      : `<img src="${escapeHtml(page.heroImageUrl)}" alt="" width="600" style="display:block;width:100%;max-height:280px;object-fit:cover;border:0;" />`
    : "";
  const greeting = recipientName
    ? `<p style="margin:0 0 12px;color:#475569;font-size:16px;line-height:1.5;">Hi ${escapeHtml(recipientName)},</p>`
    : "";
  const payment = page.paymentUrl
    ? `<p style="margin:16px 0 0;"><a href="${escapeHtml(page.paymentUrl)}" style="display:inline-block;padding:12px 20px;border:2px solid ${page.accentColor};border-radius:8px;color:${page.accentColor};text-decoration:none;font-size:14px;font-weight:700;">Continue to payment</a></p>`
    : "";

  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${template.background};font-family:Arial,sans-serif;"><tr><td align="center" style="padding:32px 16px;"><table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:${template.surface};border-radius:16px;overflow:hidden;"><tr><td>${hero}</td></tr><tr><td style="padding:36px;"><p style="margin:0 0 16px;color:${page.accentColor};font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">You're invited</p>${greeting}<h1 style="margin:0 0 16px;color:#1E293B;font-size:32px;line-height:1.2;">${title}</h1><p style="margin:0 0 28px;color:#475569;font-size:16px;line-height:1.6;">${welcome}</p><a href="${link}" style="display:inline-block;padding:14px 22px;border-radius:8px;background:${page.accentColor};color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:700;">View event &amp; register</a>${payment}<p style="margin:24px 0 0;color:#64748B;font-size:12px;line-height:1.5;">Open the event page for details, the agenda, and registration options for ${escapeHtml(eventTitle)}.</p><p style="margin:12px 0 0;color:#64748B;font-size:12px;line-height:1.5;">If the button does not work, visit <a href="${link}" style="color:${page.accentColor};">${link}</a>.</p><p style="margin:28px 0 0;color:#94A3B8;font-size:11px;text-align:center;">Sent by ${escapeHtml(organizationName)} using Beebizy</p></td></tr></table></td></tr></table>`;
}
