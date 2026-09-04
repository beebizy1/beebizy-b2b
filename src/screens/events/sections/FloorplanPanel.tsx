/**
 * Floorplan editor.
 *
 * The old FloorplanTab persisted `layout: { [key: string]: unknown }` — an opaque blob
 * nothing could read back, so the plan couldn't tell you how many seats it held or
 * whether that matched the event's capacity. Items are typed now, positioned as
 * percentages of the room box so a plan drawn on a laptop still reads on a phone, and
 * the seat total is checked against capacity as you go.
 *
 * Dragging is pointer-based, and every object is also reachable by keyboard: tab to it,
 * then arrow keys nudge (hold shift for a bigger step).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { GripVertical, LayoutGrid, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { EmptyState, LoadingRows, Panel, PanelHeader, Pill } from "@/components/primitives";
import {
  useCreateFloorplan,
  useDeleteFloorplan,
  useFloorplans,
  useSaveFloorplan,
} from "@/data/hooks";
import {
  FLOORPLAN_SHAPES,
  type Event,
  type Floorplan,
  type FloorplanItem,
  type FloorplanShape,
} from "@/data/entities";

interface ShapeSpec {
  label: string;
  /** Width and height as a percentage of the room box. */
  width: number;
  height: number;
  seats: number | null;
  round: boolean;
  className: string;
}

const SHAPES: Record<FloorplanShape, ShapeSpec> = {
  "round-table": { label: "Round table", width: 9, height: 12, seats: 10, round: true, className: "bg-primary-muted border-primary/40 text-foreground" },
  "long-table": { label: "Long table", width: 22, height: 7, seats: 16, round: false, className: "bg-primary-muted border-primary/40 text-foreground" },
  stage: { label: "Stage", width: 30, height: 9, seats: null, round: false, className: "bg-secondary border-secondary text-secondary-foreground" },
  bar: { label: "Bar", width: 8, height: 16, seats: null, round: false, className: "bg-info-tint border-info/40 text-info-text" },
  entrance: { label: "Entrance", width: 12, height: 6, seats: null, round: false, className: "bg-success-tint border-success/40 text-success-text" },
  dancefloor: { label: "Dance floor", width: 24, height: 20, seats: null, round: false, className: "bg-surface-sunken border-dashed border-muted-foreground/50 text-muted-foreground" },
  booth: { label: "Booth", width: 10, height: 10, seats: 4, round: false, className: "bg-warning-tint border-warning/40 text-warning-text" },
  av: { label: "AV desk", width: 9, height: 7, seats: null, round: false, className: "bg-muted border-muted-foreground/40 text-muted-foreground" },
};

const clamp = (value: number) => Math.max(2, Math.min(98, value));

function newItemId(): string {
  return `fp-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

/**
 * One room's editor. Remounted per room by the panel below (via `key`), so the local
 * unsaved state cannot leak from the terrace layout into the ballroom's.
 */
function RoomEditor({ event, plan: saved }: { event: Event; plan: Floorplan }) {
  const savePlan = useSaveFloorplan();

  const [name, setName] = useState<string | null>(null);
  const [items, setItems] = useState<FloorplanItem[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const roomRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const paletteDragState = useRef<{ shape: FloorplanShape; startX: number; startY: number } | null>(null);
  const suppressPaletteClick = useRef(false);

  // Local edits win until saved or reset; otherwise mirror the stored plan. Memoized so
  // the derived values below don't recompute on every render.
  const workingItems = useMemo(() => items ?? saved?.items ?? [], [items, saved]);
  const workingName = name ?? saved?.name ?? "Room layout";
  const dirty = items !== null || name !== null;

  const selected = workingItems.find((item) => item.id === selectedId) ?? null;

  const seatTotal = useMemo(
    () => workingItems.reduce((total, item) => total + (item.seats ?? 0), 0),
    [workingItems],
  );

  const updateItem = (id: string, patch: Partial<FloorplanItem>) => {
    setItems(workingItems.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const addShape = (shape: FloorplanShape, position?: { x: number; y: number }) => {
    const spec = SHAPES[shape];
    const sameShape = workingItems.filter((item) => item.shape === shape).length;
    const item: FloorplanItem = {
      id: newItemId(),
      shape,
      label: spec.seats === null ? spec.label : String(sameShape + 1),
      // Stagger new objects so they don't stack on the same spot.
      x: position ? clamp(position.x) : clamp(20 + ((sameShape * 13) % 60)),
      y: position ? clamp(position.y) : clamp(24 + ((sameShape * 9) % 50)),
      seats: spec.seats,
    };
    setItems([...workingItems, item]);
    setSelectedId(item.id);
  };

  const addShapeAtPointer = (shape: FloorplanShape, clientX: number, clientY: number) => {
    const room = roomRef.current;
    if (!room) return false;
    const rect = room.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return false;
    addShape(shape, {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    });
    return true;
  };

  const onPalettePointerDown = (pointerEvent: React.PointerEvent<HTMLButtonElement>, shape: FloorplanShape) => {
    if (pointerEvent.button !== 0) return;
    paletteDragState.current = { shape, startX: pointerEvent.clientX, startY: pointerEvent.clientY };
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
  };

  const onPalettePointerUp = (pointerEvent: React.PointerEvent<HTMLButtonElement>) => {
    const drag = paletteDragState.current;
    paletteDragState.current = null;
    if (pointerEvent.currentTarget.hasPointerCapture(pointerEvent.pointerId)) {
      pointerEvent.currentTarget.releasePointerCapture(pointerEvent.pointerId);
    }
    if (!drag) return;
    const moved = Math.hypot(pointerEvent.clientX - drag.startX, pointerEvent.clientY - drag.startY) > 6;
    if (!moved) return;
    suppressPaletteClick.current = true;
    addShapeAtPointer(drag.shape, pointerEvent.clientX, pointerEvent.clientY);
    window.setTimeout(() => {
      suppressPaletteClick.current = false;
    }, 0);
  };

  const removeSelected = () => {
    if (!selected) return;
    setItems(workingItems.filter((item) => item.id !== selected.id));
    setSelectedId(null);
  };

  /* --------------------------------------------------------------- dragging */

  const onPointerDown = (pointerEvent: React.PointerEvent<HTMLDivElement>, item: FloorplanItem) => {
    const room = roomRef.current;
    if (!room) return;
    const rect = room.getBoundingClientRect();
    const pointerX = ((pointerEvent.clientX - rect.left) / rect.width) * 100;
    const pointerY = ((pointerEvent.clientY - rect.top) / rect.height) * 100;
    dragState.current = { id: item.id, offsetX: pointerX - item.x, offsetY: pointerY - item.y };
    setSelectedId(item.id);
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
  };

  const onPointerMove = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    const room = roomRef.current;
    if (!drag || !room) return;
    const rect = room.getBoundingClientRect();
    const x = clamp(((pointerEvent.clientX - rect.left) / rect.width) * 100 - drag.offsetX);
    const y = clamp(((pointerEvent.clientY - rect.top) / rect.height) * 100 - drag.offsetY);
    updateItem(drag.id, { x, y });
  };

  const endDrag = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    if (dragState.current) pointerEvent.currentTarget.releasePointerCapture(pointerEvent.pointerId);
    dragState.current = null;
  };

  /* ------------------------------------------------------------- keyboard */

  // The key handler reads through a ref so the listener attaches once and still sees the
  // current selection. Re-subscribing on every render would be the alternative, and
  // depending on `updateItem` (recreated each render) would do exactly that.
  const latest = useRef({ selected, workingItems });
  latest.current = { selected, workingItems };

  useEffect(() => {
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      const { selected: target, workingItems: current } = latest.current;
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
        setItems(
          current.map((item) =>
            item.id === target.id ? { ...item, x: clamp(item.x + move[0]), y: clamp(item.y + move[1]) } : item,
          ),
        );
        return;
      }

      if (keyEvent.key === "Delete" || keyEvent.key === "Backspace") {
        keyEvent.preventDefault();
        setItems(current.filter((item) => item.id !== target.id));
        setSelectedId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /* ----------------------------------------------------------------- render */

  const capacityNote =
    event.capacity === null
      ? `${seatTotal} seats laid out`
      : seatTotal === event.capacity
        ? `${seatTotal} seats — matches capacity`
        : seatTotal > event.capacity
          ? `${seatTotal} seats — ${seatTotal - event.capacity} over capacity`
          : `${seatTotal} seats — ${event.capacity - seatTotal} short of capacity`;

  const capacityTone =
    event.capacity === null || seatTotal === 0
      ? "neutral"
      : seatTotal > event.capacity
        ? "danger"
        : seatTotal >= event.capacity
          ? "success"
          : "warning";

  return (
    <Panel>
      <PanelHeader
        title="Floorplan"
        description={capacityNote}
        actions={
          <div className="flex items-center gap-2">
            {dirty ? <Pill tone="warning">unsaved</Pill> : null}
            {dirty ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setItems(null);
                  setName(null);
                  setSelectedId(null);
                }}
              >
                <RotateCcw className="mr-1.5 size-3.5" />
                Revert
              </Button>
            ) : null}
            <Button
              size="sm"
              disabled={!dirty || savePlan.isPending}
              onClick={() =>
                savePlan.mutate(
                  { id: saved.id, eventId: event.id, draft: { name: workingName, items: workingItems } },
                  {
                    onSuccess: () => {
                      setItems(null);
                      setName(null);
                      toast({ title: "Floorplan saved" });
                    },
                    onError: (error) => toast({ title: "Couldn't save", description: error.message }),
                  },
                )
              }
            >
              <Save className="mr-1.5 size-3.5" />
              Save
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3">
        <Input
          value={workingName}
          onChange={(inputEvent) => setName(inputEvent.target.value)}
          aria-label="Floorplan name"
          className="h-8 w-52"
        />
        <span className="text-xs text-muted-foreground">Drag into the room:</span>
        {FLOORPLAN_SHAPES.map((shape) => (
          <Button
            key={shape}
            type="button"
            variant="outline"
            size="sm"
            className="touch-none cursor-grab active:cursor-grabbing"
            onPointerDown={(pointerEvent) => onPalettePointerDown(pointerEvent, shape)}
            onPointerUp={onPalettePointerUp}
            onPointerCancel={() => {
              paletteDragState.current = null;
            }}
            onClick={() => {
              if (suppressPaletteClick.current) return;
              addShape(shape);
            }}
            title={`Drag ${SHAPES[shape].label.toLowerCase()} into the room, or click to add`}
          >
            <GripVertical className="mr-1 size-3" />
            {SHAPES[shape].label}
          </Button>
        ))}
      </div>

      {(
        <>
          <div className="p-5">
            <div
              ref={roomRef}
              aria-label="Floorplan room"
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className="relative aspect-[16/10] w-full overflow-hidden rounded-lg border border-hairline bg-surface-sunken"
              style={{
                // A faint grid so objects can be lined up by eye.
                backgroundImage:
                  "linear-gradient(to right, hsl(var(--hairline)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--hairline)) 1px, transparent 1px)",
                backgroundSize: "5% 8.333%",
              }}
            >
              {workingItems.length === 0 ? (
                <div className="absolute inset-0 grid place-items-center">
                  <EmptyState
                    icon={LayoutGrid}
                    title="Empty room"
                    description="Drag tables and objects from the toolbar into this blank room. You can also click an object to add it."
                  />
                </div>
              ) : null}

              {workingItems.map((item) => {
                const spec = SHAPES[item.shape];
                const isSelected = item.id === selectedId;
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${spec.label} ${item.label}${item.seats ? `, ${item.seats} seats` : ""}`}
                    aria-pressed={isSelected}
                    onPointerDown={(pointerEvent) => onPointerDown(pointerEvent, item)}
                    onFocus={() => setSelectedId(item.id)}
                    className={cn(
                      "absolute flex cursor-grab touch-none select-none items-center justify-center border text-center text-[10px] font-semibold leading-tight shadow-xs transition-shadow active:cursor-grabbing",
                      spec.round ? "rounded-full" : "rounded-md",
                      spec.className,
                      isSelected && "ring-2 ring-ring ring-offset-1",
                    )}
                    style={{
                      left: `${item.x}%`,
                      top: `${item.y}%`,
                      width: `${spec.width}%`,
                      height: `${spec.height}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    <span className="px-1">{item.label}</span>
                  </div>
                );
              })}
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              Drag objects from the toolbar to place them. Drag again to move. Tab to an object and use the arrow
              keys to nudge it, shift for a bigger step, delete to remove.
            </p>
          </div>

          {selected ? (
            <div className="flex flex-wrap items-end gap-3 border-t border-hairline bg-surface-sunken px-5 py-3">
              <label className="space-y-1">
                <span className="block text-xs font-medium text-muted-foreground">
                  {SHAPES[selected.shape].label} label
                </span>
                <Input
                  value={selected.label}
                  onChange={(inputEvent) => updateItem(selected.id, { label: inputEvent.target.value })}
                  aria-label="Object label"
                  className="h-8 w-40"
                />
              </label>
              {selected.seats !== null ? (
                <label className="space-y-1">
                  <span className="block text-xs font-medium text-muted-foreground">Seats</span>
                  <Input
                    value={String(selected.seats)}
                    onChange={(inputEvent) => {
                      const parsed = Number.parseInt(inputEvent.target.value, 10);
                      updateItem(selected.id, { seats: Number.isFinite(parsed) ? Math.max(0, parsed) : 0 });
                    }}
                    inputMode="numeric"
                    aria-label="Seats at this table"
                    className="h-8 w-20 text-right"
                  />
                </label>
              ) : null}
              <Pill tone={capacityTone}>{capacityNote}</Pill>
              <Button variant="outline" size="sm" onClick={removeSelected}>
                <Trash2 className="mr-1.5 size-3.5 text-danger-text" />
                Remove
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}

/**
 * The rooms of an event.
 *
 * Most events are one room and should feel like it: a single room renders as it always
 * did, with the tab strip only earning its space once there is a second. "Add a room" is
 * what makes indoor/outdoor and upstairs/downstairs describable at all — before this an
 * event had exactly one plan, so the second space simply had nowhere to live.
 */
export default function FloorplanPanel({ event }: { event: Event }) {
  const { data: plans, isLoading } = useFloorplans(event.id);
  const createPlan = useCreateFloorplan();
  const deletePlan = useDeleteFloorplan();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rooms = plans ?? [];
  // Falls back to the first room whenever the selection is stale — after a delete, or
  // before anything has been picked.
  const current = rooms.find((room) => room.id === selectedId) ?? rooms[0] ?? null;

  const addRoom = () => {
    const name = `Room ${rooms.length + 1}`;
    createPlan.mutate(
      { eventId: event.id, draft: { name, items: [] } },
      {
        onSuccess: (created) => setSelectedId(created.id),
        onError: (error) => toast({ title: "Couldn't add the room", description: error.message }),
      },
    );
  };

  if (isLoading) {
    return (
      <Panel>
        <PanelHeader title="Floorplan" description="Loading…" />
        <LoadingRows rows={4} className="p-4" />
      </Panel>
    );
  }

  if (current === null) {
    return (
      <Panel>
        <PanelHeader title="Floorplan" description="No rooms yet" />
        <EmptyState
          icon={LayoutGrid}
          title="No floorplan yet"
          description="Add a room to start placing tables, a stage, a bar and the rest."
          action={
            <Button size="sm" onClick={addRoom} disabled={createPlan.isPending}>
              <Plus className="mr-1.5 size-3.5" />
              Add a room
            </Button>
          }
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {rooms.map((room) => (
          <button
            key={room.id}
            type="button"
            onClick={() => setSelectedId(room.id)}
            aria-pressed={room.id === current.id}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              room.id === current.id
                ? "border-primary bg-secondary text-secondary-foreground"
                : "border-hairline text-muted-foreground hover:text-foreground",
            )}
          >
            {room.name}
          </button>
        ))}

        <Button variant="outline" size="sm" onClick={addRoom} disabled={createPlan.isPending}>
          <Plus className="mr-1.5 size-3.5" />
          Add a room
        </Button>

        {rooms.length > 1 ? (
          <Button
            variant="outline"
            size="sm"
            disabled={deletePlan.isPending}
            onClick={() => {
              // Deleting a drawn room loses work, so it is confirmed. The last room is
              // never deletable — an event with no plan at all has no way back to one
              // except through the empty state, and that is a worse place to land.
              if (!window.confirm(`Delete "${current.name}" and everything drawn in it?`)) return;
              deletePlan.mutate(
                { id: current.id, eventId: event.id },
                {
                  onSuccess: () => setSelectedId(null),
                  onError: (error) => toast({ title: "Couldn't delete the room", description: error.message }),
                },
              );
            }}
          >
            <Trash2 className="mr-1.5 size-3.5" />
            Delete room
          </Button>
        ) : null}
      </div>

      <RoomEditor key={current.id} event={event} plan={current} />
    </div>
  );
}
