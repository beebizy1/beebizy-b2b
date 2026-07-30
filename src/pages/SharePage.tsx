import { useRoute } from "wouter";
import { useGetSharedEvent, getGetSharedEventQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Clock, CheckCircle2, Circle } from "lucide-react";

export default function SharePage() {
  const [, params] = useRoute("/share/:token");
  const token = params?.token ?? "";

  const { data: event, isLoading, isError } = useGetSharedEvent(token, {
    query: { enabled: !!token, queryKey: getGetSharedEventQueryKey(token) },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b border-border bg-white px-6 py-4 flex items-center gap-3">
          <img src="/beebizy-logo.png" alt="Beebizy" className="h-8 w-auto object-contain object-left" />
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Shared Event</span>
        </div>
        <div className="max-w-3xl mx-auto p-8 space-y-6">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (isError || !event) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <img src="/beebizy-logo.png" alt="Beebizy" className="h-10 w-auto opacity-60" />
        <h1 className="text-xl font-semibold">Link not found</h1>
        <p className="text-muted-foreground text-sm">This shared link may have expired or been revoked.</p>
      </div>
    );
  }

  const checklistItems = event.checklistItems ?? [];
  const runOfShowItems = (event.runOfShowItems ?? []) as {
    id: string; startTime: string; duration?: number | null; title: string; description?: string | null; responsible?: string | null;
  }[];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/beebizy-logo.png" alt="Beebizy" className="h-8 w-auto object-contain object-left" />
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-widest border-l border-border pl-3">Shared Event</span>
        </div>
        <Badge variant="outline" className="capitalize">{event.status}</Badge>
      </div>

      <div className="max-w-3xl mx-auto p-8 space-y-8">
        {/* Event header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">{event.title}</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <Badge variant="secondary">{event.category}</Badge>
            {event.date && (
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {format(new Date(event.date), "PPP")}
                {event.endDate && <> — {format(new Date(event.endDate), "PPP")}</>}
              </span>
            )}
            {event.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {event.location}
              </span>
            )}
          </div>
          {event.description && (
            <p className="mt-3 text-muted-foreground text-sm leading-relaxed">{event.description}</p>
          )}
        </div>

        {/* Run of Show */}
        {runOfShowItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Run of Show
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-0">
                {runOfShowItems.map((item, i) => (
                  <div key={item.id} className="flex gap-4 py-3 border-b border-border last:border-0">
                    <div className="w-20 shrink-0 text-right">
                      <span className="text-sm font-mono text-muted-foreground">{item.startTime}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{item.title}</div>
                      {item.duration && (
                        <div className="text-xs text-muted-foreground">{item.duration} min</div>
                      )}
                      {item.description && (
                        <div className="text-xs text-muted-foreground mt-0.5">{item.description}</div>
                      )}
                      {item.responsible && (
                        <div className="text-xs text-primary/70 mt-0.5">Owner: {item.responsible}</div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0 pt-0.5">#{i + 1}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Checklist */}
        {checklistItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                Checklist
                <span className="text-sm font-normal text-muted-foreground ml-auto">
                  {checklistItems.filter((i: { completed?: boolean }) => i.completed).length} / {checklistItems.length} done
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {checklistItems.map((item: { id: string; title: string; description?: string | null; category?: string | null; completed?: boolean }) => (
                  <div key={item.id} className={`flex items-start gap-3 p-3 rounded-lg border ${item.completed ? "bg-muted/30 border-muted" : "border-border"}`}>
                    {item.completed ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${item.completed ? "line-through text-muted-foreground" : ""}`}>
                        {item.title}
                      </div>
                      {item.description && (
                        <div className="text-xs text-muted-foreground mt-0.5">{item.description}</div>
                      )}
                    </div>
                    {item.category && (
                      <Badge variant="outline" className="text-xs shrink-0">{item.category}</Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {runOfShowItems.length === 0 && checklistItems.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p>No run of show or checklist items have been added yet.</p>
          </div>
        )}

        <div className="text-center pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Powered by <a href="/" className="font-medium text-foreground hover:underline">Beebizy</a> — Professional Event Management
          </p>
        </div>
      </div>
    </div>
  );
}
