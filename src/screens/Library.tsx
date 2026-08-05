/**
 * Library: the things you reuse across events.
 *
 * Templates and Locations were separate nav items competing with live work. They belong
 * together and one level down, because you touch them when you're setting up, not when
 * you're running an event.
 */

import { useState } from "react";
import { Link } from "wouter";
import { Building2, CalendarPlus, FileStack, MapPin, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import {
  useCreateLocation,
  useDeleteLocation,
  useDeleteTemplate,
  useLocations,
  useTemplates,
} from "@/data/hooks";

function TemplatesPanel() {
  const { data: templates, isLoading, isError, error, refetch } = useTemplates();
  const removeTemplate = useDeleteTemplate();

  return (
    <Panel>
      <PanelHeader
        title="Templates"
        description="A template brings its checklist, run of show and budget into a new event in one step"
      />
      {isError ? (
        <ErrorNotice error={error} onRetry={() => void refetch()} className="m-4" />
      ) : isLoading ? (
        <LoadingRows rows={3} className="p-4" />
      ) : (templates ?? []).length === 0 ? (
        <EmptyState
          icon={FileStack}
          title="No templates yet"
          description="Open any event's ··· menu and choose “Save as template” to turn what you just did into the starting point for next time."
        />
      ) : (
        <ul className="divide-y divide-hairline">
          {(templates ?? []).map((template) => (
            <li key={template.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">{template.name}</span>
                  <Pill>{template.category}</Pill>
                </div>
                {template.description ? (
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{template.description}</p>
                ) : null}
                <p data-numeric className="mt-1.5 text-xs text-muted-foreground">
                  {template.checklistCount} tasks · {template.runOfShowCount} cues · {template.budgetCount} budget lines
                  {template.defaultCapacity ? ` · default capacity ${template.defaultCapacity}` : ""}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href="/app/events/new">
                    <CalendarPlus className="mr-1.5 size-3.5" />
                    Use
                  </Link>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" aria-label={`Delete ${template.name}`}>
                      <Trash2 className="size-3.5 text-danger-text" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete “{template.name}”?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Events already created from it keep everything they copied. Only the template goes.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() =>
                          removeTemplate.mutate(
                            { id: template.id },
                            {
                              onSuccess: () => toast({ title: "Template deleted" }),
                              onError: (mutationError) =>
                                toast({ title: "Couldn't delete", description: mutationError.message }),
                            },
                          )
                        }
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function VenuesPanel() {
  const { data: locations, isLoading, isError, error, refetch } = useLocations();
  const createLocation = useCreateLocation();
  const removeLocation = useDeleteLocation();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");

  return (
    <Panel>
      <PanelHeader
        title="Venues"
        description="Saved venues attach to events and keep their own event count"
      />

      <form
        className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          const trimmedName = name.trim();
          if (!trimmedName) return;
          createLocation.mutate(
            { name: trimmedName, corporationName: "", city: city.trim() || null },
            {
              onSuccess: () => {
                setName("");
                setCity("");
              },
              onError: (mutationError) => toast({ title: "Couldn't add venue", description: mutationError.message }),
            },
          );
        }}
      >
        <Input
          value={name}
          onChange={(inputEvent) => setName(inputEvent.target.value)}
          placeholder="Venue name"
          aria-label="Venue name"
          className="min-w-[9rem] flex-1"
        />
        <Input
          value={city}
          onChange={(inputEvent) => setCity(inputEvent.target.value)}
          placeholder="City"
          aria-label="City"
          className="w-36"
        />
        <Button type="submit" size="sm" disabled={!name.trim() || createLocation.isPending}>
          <Plus className="mr-1.5 size-3.5" />
          Add
        </Button>
      </form>

      {isError ? (
        <ErrorNotice error={error} onRetry={() => void refetch()} className="m-4" />
      ) : isLoading ? (
        <LoadingRows rows={3} className="p-4" />
      ) : (locations ?? []).length === 0 ? (
        <EmptyState icon={Building2} title="No venues saved" description="Add the places you use more than once." />
      ) : (
        <ul className="divide-y divide-hairline">
          {(locations ?? []).map((location) => (
            <li key={location.id} className="flex items-center gap-3 px-5 py-3">
              <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{location.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[location.address, location.city, location.state].filter(Boolean).join(", ") || "No address"}
                </p>
              </div>
              <span data-numeric className="shrink-0 text-xs text-muted-foreground">
                {location.eventCount} {location.eventCount === 1 ? "event" : "events"}
              </span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" aria-label={`Delete ${location.name}`}>
                    <Trash2 className="size-3.5 text-danger-text" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete “{location.name}”?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {location.eventCount > 0
                        ? `${location.eventCount} event${location.eventCount === 1 ? "" : "s"} still use this venue, so it can't be deleted yet. Move those events first.`
                        : "Nothing uses this venue, so it's safe to remove."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={location.eventCount > 0}
                      onClick={() =>
                        removeLocation.mutate(
                          { id: location.id },
                          {
                            onSuccess: () => toast({ title: "Venue deleted" }),
                            onError: (mutationError) =>
                              toast({ title: "Couldn't delete", description: mutationError.message }),
                          },
                        )
                      }
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default function Library() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Library"
        title="What you reuse"
        description="Templates and venues. Set these up once and every future event starts further along."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <TemplatesPanel />
        <VenuesPanel />
      </div>
    </div>
  );
}
