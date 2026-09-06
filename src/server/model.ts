/**
 * Which model the planner talks to, and whether it talks to one at all.
 *
 * Two credentials are possible and `ANTHROPIC_API_KEY` wins. It is the company's own key,
 * so usage bills to Anthropic and the call works whether or not there is a card on the
 * Vercel account — which is why the gateway path had never actually run: it refuses
 * without one, and every planner call quietly fell back to the deterministic answer.
 *
 * Google's free tier is the second choice, for demos and development while the Anthropic
 * account is still being sorted. The gateway is third, so a deployment configured that
 * way keeps working. With no credential at all this returns null and the caller uses its
 * rule-based path, which is the only reason the feature has looked like it worked so far.
 *
 * Order matters: the first credential present wins, so a broken key higher up the list
 * silently shadows a working one below it.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import type { generateText, LanguageModel } from "ai";

/** `ai` declares this shape but does not export it, so it is taken from the call it feeds. */
type ProviderOptions = NonNullable<Parameters<typeof generateText>[0]["providerOptions"]>;

/**
 * How hard the model should think before answering. The interview has someone waiting on
 * the reply and asks for one short question, so it stays low; drafting a whole plan is
 * worth more deliberation.
 */
export type Effort = "low" | "medium";

export interface PlannerModel {
  model: LanguageModel;
  providerOptions: ProviderOptions;
}

const MODEL = "claude-opus-5";

/**
 * The free-tier stand-in.
 *
 * Flash, not Flash Lite. Lite is the obvious pick for a rate-limited tier — cheaper
 * requests, more of them — and it was tried and rejected: it loses track of what has
 * already been established and asks for the budget again after being told the theme.
 * That is the exact failure this whole exercise exists to fix, so the cheaper request is
 * not cheaper at all.
 *
 * The free tier allows a handful of requests a minute. Real use spreads across that
 * comfortably, because a person is typing between turns; several people demoing at once
 * will not, and will drop to the deterministic script for a turn.
 */
const FREE_MODEL = "gemini-2.5-flash";

/**
 * An identity-linked key belongs to a person rather than to a workspace, so it cannot act
 * until it is told which workspace it is acting in: every endpoint rejects it outright
 * with "anthropic-workspace-id is required". An ordinary key carries its own workspace and
 * needs no header, so this is only sent when configured.
 */
function anthropicClient() {
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
  return createAnthropic(
    workspaceId ? { headers: { "anthropic-workspace-id": workspaceId } } : {},
  );
}

/**
 * The model to use for one planner call, or null when nothing is configured.
 *
 * `feature` and `user` are only observability tags; they reach the gateway, not the model,
 * and never influence what it is asked.
 */
export function plannerModel({
  effort,
  feature,
  user,
}: {
  effort: Effort;
  feature: string;
  user: string;
}): PlannerModel | null {
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      model: anthropicClient()(MODEL),
      /*
       * Effort is the lever for thinking depth, and the right one here. Turning thinking
       * off entirely is the cheaper-looking option and the wrong one: this model then
       * writes tool calls into its prose instead of emitting them, which would break the
       * structured reply the planner depends on.
       */
      providerOptions: { anthropic: { effort } },
    };
  }

  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return {
      model: google(FREE_MODEL),
      // No effort dial here — that is an Anthropic control, and sending it to another
      // provider is how a request starts failing for a reason nobody can see.
      providerOptions: {},
    };
  }

  if (process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY) {
    return {
      model: `anthropic/${MODEL}`,
      providerOptions: {
        gateway: { user, tags: [`feature:${feature}`, "product:beebizy-studio"] },
      },
    };
  }

  return null;
}
