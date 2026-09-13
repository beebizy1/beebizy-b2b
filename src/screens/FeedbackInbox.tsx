import { Redirect, Link } from "wouter";
import { Bug, Building2, Lightbulb, MessagesSquare } from "lucide-react";
import {
  EmptyState,
  ErrorNotice,
  LoadingRows,
  PageHeader,
  Panel,
  PanelHeader,
  Pill,
  StatTile,
  type Tone,
} from "@/components/primitives";
import { useFeedbackInbox, useMe } from "@/data/hooks";
import type { FeedbackCategory } from "@/data/entities";

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  general: "General",
  bug: "Something broke",
  idea: "Idea",
  praise: "Worked well",
};

const CATEGORY_TONES: Record<FeedbackCategory, Tone> = {
  general: "neutral",
  bug: "danger",
  idea: "info",
  praise: "success",
};

const submittedAtFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function FeedbackInbox() {
  const { data: identity, isLoading: identityLoading } = useMe();
  const canReview = identity?.canReviewFeedback === true;
  const { data: feedback = [], isLoading, isError, error, refetch } = useFeedbackInbox(
    identity?.userId ?? "anonymous",
    canReview,
  );

  if (!identityLoading && !canReview) return <Redirect to="/app" replace />;

  const bugCount = feedback.filter((item) => item.category === "bug").length;
  const ideaCount = feedback.filter((item) => item.category === "idea").length;
  const workspaceCount = new Set(feedback.map((item) => item.workspaceId)).size;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Beebizy team only"
        title="Pilot feedback"
        description="Feedback from every pilot workspace. This inbox is visible only to the approved Beebizy product team."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Responses" value={feedback.length} icon={MessagesSquare} loading={identityLoading || isLoading} />
        <StatTile label="Bugs" value={bugCount} icon={Bug} tone="danger" loading={identityLoading || isLoading} />
        <StatTile label="Ideas" value={ideaCount} icon={Lightbulb} tone="info" loading={identityLoading || isLoading} />
        <StatTile label="Workspaces" value={workspaceCount} icon={Building2} loading={identityLoading || isLoading} />
      </div>

      {isError ? <ErrorNotice error={error} title="Couldn't load pilot feedback" onRetry={() => void refetch()} /> : null}

      <Panel>
        <PanelHeader
          title="Latest feedback"
          description="Newest first, across all pilot workspaces."
        />
        {identityLoading || isLoading ? (
          <LoadingRows rows={6} className="p-4" />
        ) : feedback.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title="No feedback yet"
            description="New responses will appear here as pilot users submit them."
          />
        ) : (
          <ul className="divide-y divide-hairline">
            {feedback.map((item) => (
              <li key={item.id} className="space-y-3 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Pill tone={CATEGORY_TONES[item.category]}>{CATEGORY_LABELS[item.category]}</Pill>
                  <time className="text-xs text-muted-foreground" dateTime={item.createdAt}>
                    {submittedAtFormatter.format(new Date(item.createdAt))}
                  </time>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{item.message}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{item.userName ?? item.userEmail ?? item.userId}</span>
                  {item.userEmail && item.userName ? <span>{item.userEmail}</span> : null}
                  <span>{item.workspaceName}</span>
                  {item.pagePath ? (
                    <Link href={item.pagePath} className="font-medium text-primary-text underline underline-offset-2">
                      Open submitted page
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
