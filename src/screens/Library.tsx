/**
 * Library: the things you reuse across events.
 *
 * Templates and Locations were separate nav items competing with live work. They belong
 * together and one level down, because you touch them when you're setting up, not when
 * you're running an event.
 */

import { useState } from "react";
import { Link } from "wouter";
import { Building2, CalendarPlus, FileStack, LayoutGrid, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
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
  useCanvases,
  useCreateCanvas,
  useCreateLocation,
  useDeleteCanvas,
  useDeleteLocation,
  useDeleteTemplate,
  useEvents,
  useLocations,
  useTemplates,
  useUpdateLocation,
} from "@/data/hooks";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { Location } from "@/data/entities";

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
                  <Link
                    href={`/app/library/templates/${template.id}`}
                    className="truncate text-sm font-semibold text-foreground hover:underline"
                  >
                    {template.name}
                  </Link>
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
                  <Link href={`/app/library/templates/${template.id}`}>
                    <Pencil className="mr-1.5 size-3.5" />
                    Edit
                  </Link>
                </Button>
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

function BoardsPanel() {
  const { data: boards, isLoading, isError, error, refetch } = useCanvases();
  const { data: events } = useEvents();
  const createBoard = useCreateCanvas();
  const removeBoard = useDeleteCanvas();
  const [name, setName] = useState("");

  const eventTitle = (eventId: string | null) =>
    eventId ? (events?.find((event) => event.id === eventId)?.title ?? null) : null;

  return (
    <Panel>
      <PanelHeader
        title="Boards"
        description="Freeform space for working out a look before it is an event — notes, images, swatches and links"
      />

      <form
        className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return;
          createBoard.mutate(
            { name: trimmed },
            {
              onSuccess: () => setName(""),
              onError: (mutationError) => toast({ title: "Couldn't create board", description: mutationError.message }),
            },
          );
        }}
      >
        <Input
          value={name}
          onChange={(inputEvent) => setName(inputEvent.target.value)}
          placeholder="New board name…"
          aria-label="Board name"
          className="min-w-[10rem] flex-1"
        />
        <Button type="submit" size="sm" disabled={!name.trim() || createBoard.isPending}>
          <Plus className="mr-1.5 size-3.5" />
          Create
        </Button>
      </form>

      {isError ? (
        <ErrorNotice error={error} onRetry={() => void refetch()} className="m-4" />
      ) : isLoading ? (
        <LoadingRows rows={2} className="p-4" />
      ) : (boards ?? []).length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="No boards yet"
          description="Start one when you are still deciding how something should look or feel."
        />
      ) : (
        <ul className="divide-y divide-hairline">
          {(boards ?? []).map((board) => {
            const linked = eventTitle(board.eventId);
            return (
              <li key={board.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/app/library/boards/${board.id}`}
                      className="truncate text-sm font-semibold text-foreground hover:underline"
                    >
                      {board.name}
                    </Link>
                    {linked ? <Pill tone="info">{linked}</Pill> : <Pill>unlinked</Pill>}
                  </div>
                  {board.description ? (
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{board.description}</p>
                  ) : null}
                  <p data-numeric className="mt-1.5 text-xs text-muted-foreground">
                    {board.cards.length} {board.cards.length === 1 ? "card" : "cards"}
                    {board.cards.length > 0
                      ? ` · ${[...new Set(board.cards.map((card) => card.kind))].sort().join(", ")}`
                      : ""}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/app/library/boards/${board.id}`}>
                      <Pencil className="mr-1.5 size-3.5" />
                      Open
                    </Link>
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" aria-label={`Delete ${board.name}`}>
                        <Trash2 className="size-3.5 text-danger-text" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete “{board.name}”?</AlertDialogTitle>
                        <AlertDialogDescription>
                          The board and its {board.cards.length} card{board.cards.length === 1 ? "" : "s"} go. Any event
                          it was linked to is untouched.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            removeBoard.mutate(
                              { id: board.id },
                              {
                                onSuccess: () => toast({ title: "Board deleted" }),
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
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function EditVenueDialog({ location }: { location: Location }) {
  const updateLocation = useUpdateLocation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: location.name,
    corporationName: location.corporationName,
    address: location.address ?? "",
    city: location.city ?? "",
    state: location.state ?? "",
    country: location.country,
    phone: location.phone ?? "",
  });

  const set = (key: keyof typeof form, value: string) => setForm((previous) => ({ ...previous, [key]: value }));

  const fields: Array<[keyof typeof form, string, string]> = [
    ["name", "Name", "Moscone Center West"],
    ["corporationName", "Organisation", "Northwind Systems"],
    ["address", "Address", "800 Howard St"],
    ["city", "City", "San Francisco"],
    ["state", "State", "CA"],
    ["country", "Country", "USA"],
    ["phone", "Phone", "+1 415 555 0100"],
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Edit ${location.name}`}>
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit venue</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            if (!form.name.trim()) return;
            updateLocation.mutate(
              {
                id: location.id,
                patch: {
                  name: form.name.trim(),
                  corporationName: form.corporationName.trim(),
                  address: form.address.trim() || null,
                  city: form.city.trim() || null,
                  state: form.state.trim() || null,
                  country: form.country.trim() || "USA",
                  phone: form.phone.trim() || null,
                },
              },
              {
                onSuccess: () => {
                  setOpen(false);
                  // Events embed a venue snapshot, so a rename shows up on them too.
                  toast({ title: "Venue updated", description: "Events at this venue now show the new details." });
                },
                onError: (error) => toast({ title: "Couldn't update", description: error.message }),
              },
            );
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map(([key, label, placeholder]) => (
              <div key={key} className={key === "name" || key === "address" ? "sm:col-span-2" : undefined}>
                <Label htmlFor={`venue-${key}`} className="text-xs">
                  {label}
                </Label>
                <Input
                  id={`venue-${key}`}
                  value={form[key]}
                  placeholder={placeholder}
                  onChange={(inputEvent) => set(key, inputEvent.target.value)}
                  className="mt-1"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!form.name.trim() || updateLocation.isPending}>
              Save venue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
              <EditVenueDialog location={location} />
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
        description="Templates, boards and venues. Set these up once and every future event starts further along."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-6">
          <TemplatesPanel />
          <BoardsPanel />
        </div>
        <VenuesPanel />
      </div>
    </div>
  );
}
