import { z } from "zod";
import type { RegistrationPageSettings } from "./registrationPage";

const short = z.string().max(2000);
const url = z.string().max(2000).nullable();
const page: z.ZodType<RegistrationPageSettings> = z.object({
  template: z.enum(["warm", "garden", "coastal"]), accentColor: z.string().max(40),
  headline: short, aboutHeading: short, aboutBody: z.string().max(4000), agendaIntroduction: short, welcomeMessage: z.string().max(3000),
  heroImageUrl: url, heroImageDisplay: z.enum(["banner", "logo"]), aboutImageUrl: url, agendaImageUrl: url, paymentUrl: url.optional(),
  footerImageSource: z.enum(["invitation", "custom", "none"]), footerImageUrl: url,
  showAgenda: z.boolean(), showSpeakers: z.boolean(), showSponsors: z.boolean(), showVolunteerSignup: z.boolean(), collectOrganization: z.boolean(),
  speakers: z.array(z.object({ id: short, name: short, title: short, organization: short, bio: short, photoUrl: url })).max(8),
  registrationTypes: z.array(short).max(8),
  infoPages: z.array(z.object({ id: short, navLabel: short, title: short, body: z.string().max(5000) })).max(6),
  questions: z.array(z.object({ id: z.string().max(80), label: short, type: z.enum(["text", "select"]), required: z.boolean(), options: z.array(z.string().max(1000)).max(20) })).max(12),
  postEventSubject: short, postEventThankYou: z.string().max(4000), postEventWrapUp: z.string().max(5000),
});
/** Unlike published settings, incomplete labels and choices must survive draft recovery. */
export const registrationDesignDraftSchema = z.object({
  page, guestTypesInput: z.string().max(1000), revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), discarded: z.boolean(),
});
export type RegistrationDesignDraft = z.infer<typeof registrationDesignDraftSchema>;
export interface RegistrationDesignDraftRepository {
  get(eventId: string): Promise<RegistrationDesignDraft | null>;
  save(eventId: string, draft: RegistrationDesignDraft): Promise<RegistrationDesignDraft>;
}
