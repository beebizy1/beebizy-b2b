/**
 * Template editor.
 *
 * A template is only worth having if you can correct it — the previous build could
 * create one and use one, but the 600-line TemplateDetail page that edited its contents
 * went away with the dashboard, leaving templates immutable. Contents are edited as one
 * document and saved atomically, so the item counts shown in the library can never
 * disagree with what the template actually contains.
 */

import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, CalendarPlus, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  EmptyState,
  ErrorNotice,
  LoadingRows,
  Panel,
  PanelHeader,
  PageHeader,
  Pill,
} from "@/components/primitives";
import { useReplaceTemplateContents, useTemplate, useUpdateTemplate } from "@/data/hooks";
import { centsFromInput, centsToInput, formatMoney, sumCents } from "@/data/money";
import { EVENT_CATEGORIES, type TemplateContents } from "@/data/entities";
import { formatClockTime } from "@/lib/datetime";

const CHECKLIST_AREAS = [
  "Venue",
  "Catering",
  "AV",
  "Print",
  "Logistics",
  "Marketing",
  "Programme",
  "Staffing",
  "Sponsorship",
  "Fundraising",
  "Compliance",
  "General",
];

const nowIso = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

export default function TemplateDetail({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const { data: template, isLoading, isError, error, refetch } = useTemplate(id);
  const updateTemplate = useUpdateTemplate();
  const replaceContents = useReplaceTemplateContents();

  const [contents, setContents] = useState<TemplateContents | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskArea, setTaskArea] = useState("General");
  const [cueTime, setCueTime] = useState("09:00");
  const [cueTitle, setCueTitle] = useState("");
  const [lineName, setLineName] = useState("");
  const [lineAmount, setLineAmount] = useState("");
  const [lineType, setLineType] = useState<"expense" | "revenue">("expense");

  const working: TemplateContents = useMemo(
    () =>
      contents ?? {
        checklistItems: template?.checklistItems ?? [],
        runOfShowItems: template?.runOfShowItems ?? [],
        budgetItems: template?.budgetItems ?? [],
      },
    [contents, template],
  );
  const dirty = contents !== null;

  if (isLoading) return <LoadingRows rows={6} />;
  if (isError) return <ErrorNotice error={error} title="Couldn't load this template" onRetry={() => void refetch()} />;

  if (!template) {
    return (
      <Panel className="p-8 text-center">
        <h1 className="headline text-foreground">That template doesn't exist</h1>
        <Button asChild className="mt-4" size="sm">
          <Link href="/app/library">Back to library</Link>
        </Button>
      </Panel>
    );
  }

  const plannedSpend = sumCents(
    working.budgetItems.filter((item) => item.type === "expense").map((item) => item.estimatedCents),
  );
  const plannedRevenue = sumCents(
    working.budgetItems.filter((item) => item.type === "revenue").map((item) => item.estimatedCents),
  );

  const save = () => {
    replaceContents.mutate(
      { id, contents: working },
      {
        onSuccess: () => {
          setContents(null);
          toast({ title: "Template saved" });
        },
        onError: (mutationError) => toast({ title: "Couldn't save", description: mutationError.message }),
      },
    );
  };

  return (
    <div className="space-y-6">
      <Link
        href="/app/library"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Library
      </Link>

      <PageHeader
        title={template.name}
        description="Everything here is copied into a new event when you start from this template."
        actions={
          <div className="flex items-center gap-2">
            {dirty ? <Pill tone="warning">unsaved</Pill> : null}
            {dirty ? (
              <Button variant="outline" size="sm" onClick={() => setContents(null)}>
                <RotateCcw className="mr-1.5 size-3.5" />
                Revert
              </Button>
            ) : null}
            <Button size="sm" disabled={!dirty || replaceContents.isPending} onClick={save}>
              <Save className="mr-1.5 size-3.5" />
              Save contents
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/app/events/new">
                <CalendarPlus className="mr-1.5 size-3.5" />
                Use it
              </Link>
            </Button>
          </div>
        }
      />

      <Panel>
        <PanelHeader title="About this template" description="Saved as you leave each field" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Name</Label>
            <Input
              id="tpl-name"
              defaultValue={template.name}
              onBlur={(blurEvent) => {
                const next = blurEvent.target.value.trim();
                if (!next || next === template.name) return;
                updateTemplate.mutate({ id, patch: { name: next } });
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-category">Category</Label>
            <Select
              value={template.category}
              onValueChange={(value) => updateTemplate.mutate({ id, patch: { category: value } })}
            >
              <SelectTrigger id="tpl-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="tpl-description">Description</Label>
            <Textarea
              id="tpl-description"
              defaultValue={template.description ?? ""}
              rows={2}
              onBlur={(blurEvent) => {
                const next = blurEvent.target.value.trim() || null;
                if (next === template.description) return;
                updateTemplate.mutate({ id, patch: { description: next } });
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-capacity">Default capacity</Label>
            <Input
              id="tpl-capacity"
              defaultValue={template.defaultCapacity === null ? "" : String(template.defaultCapacity)}
              inputMode="numeric"
              onBlur={(blurEvent) => {
                const raw = blurEvent.target.value.trim();
                const next = raw === "" ? null : Number.parseInt(raw, 10);
                if (next === template.defaultCapacity || (next !== null && !Number.isFinite(next))) return;
                updateTemplate.mutate({ id, patch: { defaultCapacity: next } });
              }}
            />
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Checklist */}
        <Panel>
          <PanelHeader title="Checklist" description={`${working.checklistItems.length} tasks`} />
          <form
            className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              const trimmed = taskTitle.trim();
              if (!trimmed) return;
              setContents({
                ...working,
                checklistItems: [
                  ...working.checklistItems,
                  {
                    id: newId("tcl"),
                    title: trimmed,
                    description: null,
                    completed: false,
                    dueDate: null,
                    assignedTo: null,
                  assignedEmail: null,
                    category: taskArea,
                    sortOrder: working.checklistItems.length + 1,
                    createdAt: nowIso(),
                  },
                ],
              });
              setTaskTitle("");
            }}
          >
            <Input
              value={taskTitle}
              onChange={(inputEvent) => setTaskTitle(inputEvent.target.value)}
              placeholder="Add a task…"
              aria-label="Template task"
              className="min-w-[9rem] flex-1"
            />
            <Select value={taskArea} onValueChange={setTaskArea}>
              <SelectTrigger className="w-[142px]" aria-label="Task area">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHECKLIST_AREAS.map((area) => (
                  <SelectItem key={area} value={area}>
                    {area}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" size="sm" disabled={!taskTitle.trim()}>
              <Plus className="mr-1.5 size-3.5" />
              Add
            </Button>
          </form>

          {working.checklistItems.length === 0 ? (
            <EmptyState title="No tasks yet" description="These become the new event's checklist." />
          ) : (
            <ul className="divide-y divide-hairline">
              {working.checklistItems.map((item) => (
                <li key={item.id} className="group flex items-center gap-3 px-5 py-2.5">
                  <Pill>{item.category}</Pill>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{item.title}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${item.title}`}
                    onClick={() =>
                      setContents({
                        ...working,
                        checklistItems: working.checklistItems.filter((row) => row.id !== item.id),
                      })
                    }
                    className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-danger-text focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Run of show */}
        <Panel>
          <PanelHeader title="Run of show" description={`${working.runOfShowItems.length} cues`} />
          <form
            className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              const trimmed = cueTitle.trim();
              if (!trimmed) return;
              setContents({
                ...working,
                runOfShowItems: [
                  ...working.runOfShowItems,
                  {
                    id: newId("tros"),
                    startTime: cueTime,
                    duration: null,
                    title: trimmed,
                    description: null,
                    responsible: null,
                    sortOrder: working.runOfShowItems.length + 1,
                    createdAt: nowIso(),
                  },
                ].sort((a, b) => a.startTime.localeCompare(b.startTime)),
              });
              setCueTitle("");
            }}
          >
            <Input
              type="time"
              value={cueTime}
              onChange={(inputEvent) => setCueTime(inputEvent.target.value)}
              aria-label="Cue time"
              className="w-[110px]"
            />
            <Input
              value={cueTitle}
              onChange={(inputEvent) => setCueTitle(inputEvent.target.value)}
              placeholder="What happens…"
              aria-label="Template cue"
              className="min-w-[9rem] flex-1"
            />
            <Button type="submit" size="sm" disabled={!cueTitle.trim()}>
              <Plus className="mr-1.5 size-3.5" />
              Add
            </Button>
          </form>

          {working.runOfShowItems.length === 0 ? (
            <EmptyState title="No cues yet" description="Add the shape of the day once and reuse it." />
          ) : (
            <ol className="divide-y divide-hairline">
              {working.runOfShowItems.map((cue) => (
                <li key={cue.id} className="group flex items-center gap-3 px-5 py-2.5">
                  <span data-numeric className="w-[4.5rem] shrink-0 font-mono text-xs font-semibold text-foreground">
                    {formatClockTime(cue.startTime)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{cue.title}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${cue.title}`}
                    onClick={() =>
                      setContents({
                        ...working,
                        runOfShowItems: working.runOfShowItems.filter((row) => row.id !== cue.id),
                      })
                    }
                    className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-danger-text focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        {/* Budget */}
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Budget"
            description={`${formatMoney(plannedSpend)} planned spend · ${formatMoney(plannedRevenue)} planned revenue`}
          />
          <form
            className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              const trimmed = lineName.trim();
              const cents = centsFromInput(lineAmount);
              if (!trimmed || cents === null) return;
              setContents({
                ...working,
                budgetItems: [
                  ...working.budgetItems,
                  {
                    id: newId("tbud"),
                    name: trimmed,
                    category: "General",
                    type: lineType,
                    estimatedCents: cents,
                    actualCents: null,
                    notes: null,
                    sortOrder: working.budgetItems.length + 1,
                    createdAt: nowIso(),
                  },
                ],
              });
              setLineName("");
              setLineAmount("");
            }}
          >
            <Input
              value={lineName}
              onChange={(inputEvent) => setLineName(inputEvent.target.value)}
              placeholder="Add a budget line…"
              aria-label="Template budget line"
              className="min-w-[9rem] flex-1"
            />
            <Select value={lineType} onValueChange={(value) => setLineType(value as "expense" | "revenue")}>
              <SelectTrigger className="w-[124px]" aria-label="Line type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Expense</SelectItem>
                <SelectItem value="revenue">Revenue</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={lineAmount}
              onChange={(inputEvent) => setLineAmount(inputEvent.target.value)}
              placeholder="Amount"
              inputMode="decimal"
              aria-label="Template line amount"
              className="w-28 text-right"
            />
            <Button type="submit" size="sm" disabled={!lineName.trim() || centsFromInput(lineAmount) === null}>
              <Plus className="mr-1.5 size-3.5" />
              Add
            </Button>
          </form>

          {working.budgetItems.length === 0 ? (
            <EmptyState title="No budget lines yet" description="Estimates only — actuals belong to the event." />
          ) : (
            <ul className="divide-y divide-hairline">
              {working.budgetItems.map((item) => (
                <li key={item.id} className="group flex items-center gap-3 px-5 py-2.5">
                  <Pill tone={item.type === "revenue" ? "success" : "neutral"}>{item.type}</Pill>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{item.name}</span>
                  <Input
                    defaultValue={centsToInput(item.estimatedCents)}
                    inputMode="decimal"
                    aria-label={`Estimate for ${item.name}`}
                    className="h-8 w-28 text-right"
                    onBlur={(blurEvent) => {
                      const next = centsFromInput(blurEvent.target.value);
                      if (next === null || next === item.estimatedCents) return;
                      setContents({
                        ...working,
                        budgetItems: working.budgetItems.map((row) =>
                          row.id === item.id ? { ...row, estimatedCents: next } : row,
                        ),
                      });
                    }}
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${item.name}`}
                    onClick={() =>
                      setContents({
                        ...working,
                        budgetItems: working.budgetItems.filter((row) => row.id !== item.id),
                      })
                    }
                    className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-danger-text focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {dirty ? (
        <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning-tint px-4 py-3 shadow-md">
          <p className="text-sm font-medium text-warning-text">
            Contents changed. They won't apply to new events until you save.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setContents(null)}>
              Revert
            </Button>
            <Button size="sm" disabled={replaceContents.isPending} onClick={save}>
              Save contents
            </Button>
          </div>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Deleted this template by mistake?{" "}
        <button type="button" className="underline hover:text-foreground" onClick={() => navigate("/app/library")}>
          Back to the library
        </button>{" "}
        — events already created from it keep everything they copied.
      </p>
    </div>
  );
}
