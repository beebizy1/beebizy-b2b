/**
 * Which model the planner talks to, and whether it talks to one at all.
 *
 * Two credentials are possible and `ANTHROPIC_API_KEY` wins. It is the company's own key,
 * so usage bills to Anthropic and the call works whether or not there is a card on the
 * Vercel account — which is why the gateway path had never actually run: it refuses
 * without one, and every planner call quietly fell back to the deterministic answer.
 *
 * The gateway is kept as the second choice so a deployment configured that way keeps
 * working. With neither credential this returns null and the caller uses its rule-based
 * path, which is the only reason the feature has looked like it worked so far.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
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
