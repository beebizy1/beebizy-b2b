/**
 * Board editor.
 *
 * The old build shipped both a "Canvas / Inspiration Card" area and a per-event
 * Inspiration tab without ever saying which was for what, so they read as the same
 * feature twice. The line here: an event's **mood board** is a scoped strip of reference
 * images belonging to that one event; a **board** is owner-scoped, holds mixed cards, and
 * exists before there is an event to attach it to.
 *
 * Interaction matches the floorplan editor deliberately — drag to move, tab and arrow
 * keys to nudge, local edits until saved — because two different direct-manipulation
 * idioms in one product is one too many.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ExternalLink, Image, Link2, Palette, RotateCcw, Save, StickyNote, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorNotice, LoadingRows, Panel, PanelHeader, PageHeader, Pill } from "@/components/primitives";
import { useCanvas, useEvents, useReplaceCanvasCards, useUpdateCanvas } from "@/data/hooks";
import { CANVAS_CARD_KINDS, type CanvasCard, type CanvasCardKind } from "@/data/entities";

const NO_EVENT = "__none__";

const NOTE_TINTS = ["#fde68a", "#bbf7d0", "#dbeafe", "#fbcfe8", "#e9d5ff", "#fed7aa"];

const KIND_META: Record<CanvasCardKind, { label: string; icon: typeof StickyNote; width: number }> = {
  note: { label: "Note", icon: StickyNote, width: 24 },
  image: { label: "Image", icon: Image, width: 28 },
  swatch: { label: "Swatch", icon: Palette, width: 12 },
  link: { label: "Link", icon: Link2, width: 28 },
};

/** The board's own aspect ratio, and each card kind's, so heights can be reasoned about. */
const BOARD_ASPECT = 16 / 9;
const CARD_ASPECT: Record<CanvasCardKind, number> = {
  note: 3 / 2,
  link: 3 / 2,
  image: 4 / 3.4,
  swatch: 3 / 4,
};

const clampX = (value: number, widthPercent: number) => Math.max(0, Math.min(100 - widthPercent, value));

/**
 * A card's height as a percentage of the board, derived from its width. Positions are
 * top-left, so clamping y needs the height — otherwise a tall card dropped near the
 * bottom hangs off the edge, which is what the seeded link card used to do.
 */
function heightPercent(card: Pick<CanvasCard, "kind" | "width">): number {
  return (card.width * BOARD_ASPECT) / CARD_ASPECT[card.kind];
}

const clampY = (value: number, card: Pick<CanvasCard, "kind" | "width">) =>
  Math.max(0, Math.min(Math.max(0, 100 - heightPercent(card)), value));
const newCardId = () => `cc-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

/** Readable ink for a swatch chip, so a pale colour doesn't get white text. */
function inkFor(hex: string): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "#000000";
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(clean.slice(offset, offset + 2), 16));
  // Rec. 709 luma.
  const luma = (0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)) / 255;
  return luma > 0.6 ? "#111827" : "#ffffff";
}

function CardBody({ card }: { card: CanvasCard }) {
  if (card.kind === "note") {
    return (
      <div
        className="h-full w-full rounded-md p-2.5 text-[11px] leading-snug shadow-xs"
        style={{ backgroundColor: card.color ?? NOTE_TINTS[0], color: "#111827" }}
      >
        {card.content || "Empty note"}
      </div>
    );
  }

  if (card.kind === "swatch") {
    const hex = card.color ?? card.content ?? "#cccccc";
    return (
      <div className="h-full w-full overflow-hidden rounded-md border border-hairline shadow-xs">
        <div className="grid h-3/4 place-items-center" style={{ backgroundColor: hex, color: inkFor(hex) }}>
          <span data-numeric className="font-mono text-[10px] font-semibold uppercase">
            {hex}
          </span>
        </div>
        <div className="grid h-1/4 place-items-center bg-surface px-1">
          <span className="truncate text-[10px] text-muted-foreground">{card.caption ?? "Swatch"}</span>
        </div>
      </div>
    );
  }

  if (card.kind === "image") {
    return (
      <figure className="h-full w-full overflow-hidden rounded-md border border-hairline bg-surface shadow-xs">
        <img
          src={card.content}
          alt={card.caption ?? "Board reference"}
          loading="lazy"
          className="h-[78%] w-full object-cover"
        />
        <figcaption className="truncate px-2 py-1 text-[10px] text-muted-foreground">
          {card.caption ?? "Reference"}
        </figcaption>
      </figure>
    );
  }

  return (
    <div className="flex h-full w-full flex-col justify-center gap-1 rounded-md border border-hairline bg-surface p-2.5 shadow-xs">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
        <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{card.caption ?? "Link"}</span>
      </span>
      <span className="truncate font-mono text-[10px] text-muted-foreground">{card.content}</span>
    </div>
  );
}

export default function BoardDetail({ id }: { id: string }) {
  const { data: board, isLoading, isError, error, refetch } = useCanvas(id);
  const { data: events } = useEvents();
  const updateBoard = useUpdateCanvas();
  const replaceCards = useReplaceCanvasCards();

  const [cards, setCards] = useState<CanvasCard[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);

  const working = useMemo(() => cards ?? board?.cards ?? [], [cards, board]);
  const dirty = cards !== null;
  const selected = working.find((card) => card.id === selectedId) ?? null;

  const latest = useRef({ selected, working });
  latest.current = { selected, working };

  // Attached once; reads current state through the ref (same approach as the floorplan).
  useEffect(() => {
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      const { selected: target, working: current } = latest.current;
      if (!target) return;
      const step = keyEvent.shiftKey ? 5 : 1;
      const moves: Record<string, [number, number]> = {
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
      };
      const move = moves[keyEvent.key];
      if (move) {
        keyEvent.preventDefault();
        setCards(
          current.map((card) =>
            card.id === target.id
              ? { ...card, x: clampX(card.x + move[0], card.width), y: clampY(card.y + move[1], card) }
              : card,
          ),
        );
        return;
      }
      if (keyEvent.key === "Delete" || keyEvent.key === "Backspace") {
        keyEvent.preventDefault();
        setCards(current.filter((card) => card.id !== target.id));
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (isLoading) return <LoadingRows rows={6} />;
  if (isError) return <ErrorNotice error={error} title="Couldn't load this board" onRetry={() => void refetch()} />;

  if (!board) {
    return (
      <Panel className="p-8 text-center">
        <h1 className="headline text-foreground">That board doesn't exist</h1>
        <Button asChild className="mt-4" size="sm">
          <Link href="/app/library">Back to library</Link>
        </Button>
      </Panel>
    );
  }

  const addCard = (kind: CanvasCardKind) => {
    const meta = KIND_META[kind];
    const sameKind = working.filter((card) => card.kind === kind).length;
    const card: CanvasCard = {
      id: newCardId(),
      kind,
      content:
        kind === "note"
          ? ""
          : kind === "swatch"
            ? "#c9a227"
            : kind === "image"
              ? ""
              : "https://",
      caption: kind === "swatch" ? "New swatch" : null,
      x: clampX(8 + ((sameKind * 15) % 60), meta.width),
      y: clampY(12 + ((sameKind * 11) % 60), { kind, width: meta.width }),
      width: meta.width,
      color: kind === "note" ? NOTE_TINTS[sameKind % NOTE_TINTS.length]! : kind === "swatch" ? "#c9a227" : null,
    };
    setCards([...working, card]);
    setSelectedId(card.id);
  };

  const updateCard = (cardId: string, patch: Partial<CanvasCard>) => {
    setCards(working.map((card) => (card.id === cardId ? { ...card, ...patch } : card)));
  };

  const onPointerDown = (pointerEvent: React.PointerEvent<HTMLDivElement>, card: CanvasCard) => {
    const surface = boardRef.current;
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    dragState.current = {
      id: card.id,
      offsetX: ((pointerEvent.clientX - rect.left) / rect.width) * 100 - card.x,
      offsetY: ((pointerEvent.clientY - rect.top) / rect.height) * 100 - card.y,
    };
    setSelectedId(card.id);
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
  };

  const onPointerMove = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    const surface = boardRef.current;
    if (!drag || !surface) return;
    const rect = surface.getBoundingClientRect();
    const card = working.find((row) => row.id === drag.id);
    if (!card) return;
    updateCard(drag.id, {
      x: clampX(((pointerEvent.clientX - rect.left) / rect.width) * 100 - drag.offsetX, card.width),
      y: clampY(((pointerEvent.clientY - rect.top) / rect.height) * 100 - drag.offsetY, card),
    });
  };

  const endDrag = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    if (dragState.current) pointerEvent.currentTarget.releasePointerCapture(pointerEvent.pointerId);
    dragState.current = null;
  };

  const linkedEvent = events?.find((event) => event.id === board.eventId) ?? null;

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
        eyebrow="Board"
        title={board.name}
        description={board.description ?? "A freeform space for working out a look before it becomes an event."}
        actions={
          <div className="flex items-center gap-2">
            {dirty ? <Pill tone="warning">unsaved</Pill> : null}
            {dirty ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCards(null);
                  setSelectedId(null);
                }}
              >
                <RotateCcw className="mr-1.5 size-3.5" />
                Revert
              </Button>
            ) : null}
            <Button
              size="sm"
              disabled={!dirty || replaceCards.isPending}
              onClick={() =>
                replaceCards.mutate(
                  { id, cards: working },
                  {
                    onSuccess: () => {
                      setCards(null);
                      toast({ title: "Board saved" });
                    },
                    onError: (mutationError) => toast({ title: "Couldn't save", description: mutationError.message }),
                  },
                )
              }
            >
              <Save className="mr-1.5 size-3.5" />
              Save board
            </Button>
          </div>
        }
      />

      <Panel>
        <PanelHeader
          title="Board"
          description={`${working.length} ${working.length === 1 ? "card" : "cards"}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={board.eventId ?? NO_EVENT}
                onValueChange={(value) =>
                  updateBoard.mutate({ id, patch: { eventId: value === NO_EVENT ? null : value } })
                }
              >
                <SelectTrigger className="h-8 w-[220px]" aria-label="Linked event">
                  <SelectValue placeholder="Not linked to an event" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_EVENT}>Not linked to an event</SelectItem>
                  {(events ?? []).map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {linkedEvent ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/app/events/${linkedEvent.id}`}>Open event</Link>
                </Button>
              ) : null}
            </div>
          }
        />

        <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3">
          <span className="text-xs text-muted-foreground">Add:</span>
          {CANVAS_CARD_KINDS.map((kind) => {
            const meta = KIND_META[kind];
            return (
              <Button key={kind} variant="outline" size="sm" onClick={() => addCard(kind)}>
                <meta.icon className="mr-1.5 size-3.5" aria-hidden="true" />
                {meta.label}
              </Button>
            );
          })}
        </div>

        <div className="p-5">
          <div
            ref={boardRef}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="relative aspect-[16/9] w-full overflow-hidden rounded-lg border border-hairline bg-surface-sunken"
          >
            {working.length === 0 ? (
              <div className="absolute inset-0 grid place-items-center">
                <EmptyState
                  icon={StickyNote}
                  title="Empty board"
                  description="Add notes, images, colour swatches and links, then drag them into an arrangement that makes the idea obvious."
                />
              </div>
            ) : null}

            {working.map((card) => {
              const isSelected = card.id === selectedId;
              const meta = KIND_META[card.kind];
              return (
                <div
                  key={card.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${meta.label}: ${card.caption ?? (card.content.slice(0, 40) || "empty")}`}
                  aria-pressed={isSelected}
                  onPointerDown={(pointerEvent) => onPointerDown(pointerEvent, card)}
                  onFocus={() => setSelectedId(card.id)}
                  className={cn(
                    "absolute cursor-grab touch-none select-none rounded-md active:cursor-grabbing",
                    isSelected && "ring-2 ring-ring ring-offset-2",
                  )}
                  style={{
                    left: `${card.x}%`,
                    top: `${card.y}%`,
                    width: `${card.width}%`,
                    aspectRatio: `${CARD_ASPECT[card.kind]}`,
                  }}
                >
                  <CardBody card={card} />
                </div>
              );
            })}
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            Drag to move. Tab to a card and use the arrow keys to nudge it, shift for a bigger step, delete to remove.
          </p>
        </div>

        {selected ? (
          <div className="space-y-3 border-t border-hairline bg-surface-sunken px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Pill>{KIND_META[selected.kind].label}</Pill>
              <span className="text-xs text-muted-foreground">Editing the selected card</span>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  setCards(working.filter((card) => card.id !== selected.id));
                  setSelectedId(null);
                }}
              >
                <Trash2 className="mr-1.5 size-3.5 text-danger-text" />
                Remove
              </Button>
            </div>

            {selected.kind === "note" ? (
              <>
                <Textarea
                  value={selected.content}
                  onChange={(inputEvent) => updateCard(selected.id, { content: inputEvent.target.value })}
                  placeholder="What is the idea?"
                  aria-label="Note text"
                  rows={2}
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Tint:</span>
                  {NOTE_TINTS.map((tint) => (
                    <button
                      key={tint}
                      type="button"
                      aria-label={`Tint ${tint}`}
                      aria-pressed={selected.color === tint}
                      onClick={() => updateCard(selected.id, { color: tint })}
                      className={cn(
                        "size-5 rounded border border-hairline",
                        selected.color === tint && "ring-2 ring-ring ring-offset-1",
                      )}
                      style={{ backgroundColor: tint }}
                    />
                  ))}
                </div>
              </>
            ) : null}

            {selected.kind === "swatch" ? (
              <div className="flex flex-wrap items-end gap-3">
                <label className="space-y-1">
                  <span className="block text-xs font-medium text-muted-foreground">Colour</span>
                  <input
                    type="color"
                    value={selected.color ?? "#c9a227"}
                    onChange={(inputEvent) =>
                      updateCard(selected.id, { color: inputEvent.target.value, content: inputEvent.target.value })
                    }
                    aria-label="Swatch colour"
                    className="h-8 w-16 cursor-pointer rounded border border-hairline bg-surface"
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-xs font-medium text-muted-foreground">What it's for</span>
                  <Input
                    value={selected.caption ?? ""}
                    onChange={(inputEvent) => updateCard(selected.id, { caption: inputEvent.target.value || null })}
                    aria-label="Swatch caption"
                    className="h-8 w-52"
                  />
                </label>
              </div>
            ) : null}

            {selected.kind === "image" || selected.kind === "link" ? (
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-[16rem] flex-1 space-y-1">
                  <span className="block text-xs font-medium text-muted-foreground">
                    {selected.kind === "image" ? "Image URL" : "Link URL"}
                  </span>
                  <Input
                    type="url"
                    value={selected.content}
                    onChange={(inputEvent) => updateCard(selected.id, { content: inputEvent.target.value })}
                    aria-label={selected.kind === "image" ? "Image URL" : "Link URL"}
                    className="h-8"
                  />
                </label>
                <label className="min-w-[12rem] flex-1 space-y-1">
                  <span className="block text-xs font-medium text-muted-foreground">Caption</span>
                  <Input
                    value={selected.caption ?? ""}
                    onChange={(inputEvent) => updateCard(selected.id, { caption: inputEvent.target.value || null })}
                    aria-label="Card caption"
                    className="h-8"
                  />
                </label>
              </div>
            ) : null}

            <label className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Width</span>
              <input
                type="range"
                min={8}
                max={60}
                value={selected.width}
                onChange={(inputEvent) => {
                  const width = Number(inputEvent.target.value);
                  updateCard(selected.id, {
                    width,
                    x: clampX(selected.x, width),
                    y: clampY(selected.y, { kind: selected.kind, width }),
                  });
                }}
                aria-label="Card width"
                className="w-40 accent-[hsl(var(--primary))]"
              />
              <span data-numeric className="text-xs text-muted-foreground">
                {selected.width}%
              </span>
            </label>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
