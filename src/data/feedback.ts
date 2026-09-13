import { z } from "zod";
import { FEEDBACK_CATEGORIES, FEEDBACK_LIMITS } from "./entities.ts";

/** One validation contract shared by the browser, demo adapter, API, and database repository. */
export const feedbackDraftSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  message: z.string().trim().min(FEEDBACK_LIMITS.minMessageLength).max(FEEDBACK_LIMITS.maxMessageLength),
  pagePath: z
    .string()
    .trim()
    .startsWith("/")
    .max(FEEDBACK_LIMITS.maxPagePathLength)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});

export function feedbackValidationMessage(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "feedback"}: ${issue.message}`)
    .join("; ");
}
