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
import {
  Circle,
  GripVertical,
  LayoutGrid,
  Lock,
  Minus,
  PenTool,
  Plus,
  RectangleHorizontal,
  RotateCcw,
  Save,
  Shapes,
  Trash2,
  Unlock,
} from "lucide-react";
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
  type FloorplanPoint,
  type FloorplanRoom,
  type FloorplanRoomShape,
  type FloorplanShape,
} from "@/data/entities";
import { floorplanRoomSquareFeet } from "@/data/floorplan";
import {
  DEFAULT_FLOORPLAN_ROOM,
  addRoomCorner,
  nearestPointInsideRoom,
  pointIsInsideRoom,
  roomClipPath,
  roomPointsForShape,
} from "@/data/floorplanGeometry";

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
  tree: { label: "Tree", width: 7, height: 10, seats: null, round: true, className: "bg-success-tint border-success/50 text-success-text" },
  chair: { label: "Chair", width: 4, height: 6, seats: 1, round: false, className: "bg-surface border-muted-foreground/40 text-foreground" },
  "chair-row": { label: "Row of chairs", width: 24, height: 6, seats: 8, round: false, className: "bg-surface border-primary/40 text-foreground" },
};

const clamp = (value: number) => Math.max(2, Math.min(98, value));

const ROOM_SHAPE_OPTIONS: {
  value: FloorplanRoomShape;
  label: string;
  icon: typeof RectangleHorizontal;
}[] = [
  { value: "rectangle", label: "Rectangle", icon: RectangleHorizontal },
  { value: "oval", label: "Oval", icon: Circle },
  { value: "l-shape", label: "L-shape", icon: Shapes },
  { value: "custom", label: "Custom", icon: PenTool },
];

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
  const [room, setRoom] = useState<FloorplanRoom | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCorner, setSelectedCorner] = useState<number | null>(null);
  const roomRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const cornerDragState = useRef<{ index: number } | null>(null);
  const paletteDragState = useRef<{ shape: FloorplanShape; startX: number; startY: number } | null>(null);
  const suppressPaletteClick = useRef(false);

  // Local edits win until saved or reset; otherwise mirror the stored plan. Memoized so
  // the derived values below don't recompute on every render.
  const workingItems = useMemo(() => items ?? saved?.items ?? [], [items, saved]);
  const workingName = name ?? saved?.name ?? "Room layout";
  const workingRoom = useMemo(
    () => room ?? saved.room ?? DEFAULT_FLOORPLAN_ROOM,
    [room, saved.room],
  );
  const dirty = items !== null || name !== null || room !== null;

  const selected = workingItems.find((item) => item.id === selectedId) ?? null;

  const seatTotal = useMemo(
    () => workingItems.reduce((total, item) => total + (item.seats ?? 0), 0),
    [workingItems],
  );

  const updateItem = (id: string, patch: Partial<FloorplanItem>) => {
    setItems(workingItems.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const updateRoom = (patch: Partial<FloorplanRoom>) => {
    setRoom({ ...workingRoom, ...patch });
  };

  const updateRoomPoint = (index: number, point: FloorplanPoint) => {
    updateRoom({
      points: workingRoom.points.map((current, currentIndex) =>
        currentIndex === index ? point : current,
      ),
    });
  };

  const changeRoomShape = (shape: FloorplanRoomShape) => {
    updateRoom({
      shape,
      points:
        shape === "custom" && workingRoom.shape === "custom"
          ? workingRoom.points.map((point) => ({ ...point }))
          : roomPointsForShape(shape),
    });
    setSelectedCorner(shape === "custom" ? 0 : null);
  };

  const addShape = (shape: FloorplanShape, position?: { x: number; y: number }) => {
    const spec = SHAPES[shape];
    const sameShape = workingItems.filter((item) => item.shape === shape).length;
    const staggered = {
      x: position ? clamp(position.x) : clamp(20 + ((sameShape * 13) % 60)),
      y: position ? clamp(position.y) : clamp(24 + ((sameShape * 9) % 50)),
    };
    const fallbackPosition = nearestPointInsideRoom(workingRoom, staggered);
    const item: FloorplanItem = {
      id: newItemId(),
      shape,
      label: spec.seats === null ? spec.label : String(sameShape + 1),
      // Stagger new objects so they don't stack on the same spot.
      x: fallbackPosition.x,
      y: fallbackPosition.y,
      seats: spec.seats,
      // Every object starts movable. Teams can lock true fixed features after they
      // have placed them, using the same control available for furniture.
      locked: false,
    };
    setItems([...workingItems, item]);
    setSelectedId(item.id);
  };

  const addShapeAtPointer = (shape: FloorplanShape, clientX: number, clientY: number) => {
    const room = roomRef.current;
    if (!room) return false;
    const rect = room.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return false;
    const position = {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
    if (!pointIsInsideRoom(workingRoom, position.x, position.y)) return false;
    addShape(shape, position);
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
    if (!selected || selected.locked) return;
    setItems(workingItems.filter((item) => item.id !== selected.id));
    setSelectedId(null);
  };

  /* --------------------------------------------------------------- dragging */

  const onPointerDown = (pointerEvent: React.PointerEvent<HTMLDivElement>, item: FloorplanItem) => {
    setSelectedId(item.id);
    if (item.locked) return;
    const room = roomRef.current;
    if (!room) return;
    const rect = room.getBoundingClientRect();
    const pointerX = ((pointerEvent.clientX - rect.left) / rect.width) * 100;
    const pointerY = ((pointerEvent.clientY - rect.top) / rect.height) * 100;
    dragState.current = { id: item.id, offsetX: pointerX - item.x, offsetY: pointerY - item.y };
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
  };

  const onPointerMove = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    const room = roomRef.current;
    if (!room) return;
    const rect = room.getBoundingClientRect();
    const cornerDrag = cornerDragState.current;
    if (cornerDrag) {
      updateRoomPoint(cornerDrag.index, {
        x: clamp(((pointerEvent.clientX - rect.left) / rect.width) * 100),
        y: clamp(((pointerEvent.clientY - rect.top) / rect.height) * 100),
      });
      return;
    }

    const drag = dragState.current;
    if (!drag) return;
    const x = clamp(((pointerEvent.clientX - rect.left) / rect.width) * 100 - drag.offsetX);
    const y = clamp(((pointerEvent.clientY - rect.top) / rect.height) * 100 - drag.offsetY);
    if (pointIsInsideRoom(workingRoom, x, y)) updateItem(drag.id, { x, y });
  };

  const endDrag = () => {
    dragState.current = null;
    cornerDragState.current = null;
  };

  /* ------------------------------------------------------------- keyboard */

  // The key handler reads through a ref so the listener attaches once and still sees the
  // current selection. Re-subscribing on every render would be the alternative, and
  // depending on `updateItem` (recreated each render) would do exactly that.
  const latest = useRef({ selected, workingItems, workingRoom });
  latest.current = { selected, workingItems, workingRoom };

  useEffect(() => {
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      const { selected: target, workingItems: current, workingRoom: currentRoom } = latest.current;
      if (!target) return;

      if (target.locked) return;

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
        const x = clamp(target.x + move[0]);
        const y = clamp(target.y + move[1]);
        if (!pointIsInsideRoom(currentRoom, x, y)) return;
        setItems(
          current.map((item) =>
            item.id === target.id ? { ...item, x, y } : item,
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

  const visualAspectRatio = Math.max(0.65, Math.min(2.4, workingRoom.widthFeet / workingRoom.lengthFeet));

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
                  setRoom(null);
                  setSelectedId(null);
                  setSelectedCorner(null);
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
                  {
                    id: saved.id,
                    eventId: event.id,
                    draft: { name: workingName, items: workingItems, room: workingRoom },
                  },
                  {
                    onSuccess: () => {
                      setItems(null);
                      setName(null);
                      setRoom(null);
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

      <div className="border-b border-hairline bg-surface-sunken/60 px-5 py-4">
        <div className="flex flex-wrap items-end gap-4">
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium text-muted-foreground">Room shape</legend>
            <div className="flex flex-wrap gap-1 rounded-lg border border-hairline bg-surface p-1">
              {ROOM_SHAPE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = workingRoom.shape === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => changeRoomShape(option.value)}
                    className={cn(
                      "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-secondary text-secondary-foreground shadow-xs"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3.5" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-muted-foreground">Width</span>
            <div className="relative">
              <Input
                type="number"
                min="1"
                max="10000"
                step="1"
                value={workingRoom.widthFeet}
                onChange={(inputEvent) => {
                  const value = Number(inputEvent.target.value);
                  if (Number.isFinite(value) && value > 0) updateRoom({ widthFeet: value });
                }}
                aria-label="Room width in feet"
                className="h-9 w-28 pr-8 text-right tabular-nums"
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">ft</span>
            </div>
          </label>

          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-muted-foreground">Length</span>
            <div className="relative">
              <Input
                type="number"
                min="1"
                max="10000"
                step="1"
                value={workingRoom.lengthFeet}
                onChange={(inputEvent) => {
                  const value = Number(inputEvent.target.value);
                  if (Number.isFinite(value) && value > 0) updateRoom({ lengthFeet: value });
                }}
                aria-label="Room length in feet"
                className="h-9 w-28 pr-8 text-right tabular-nums"
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">ft</span>
            </div>
          </label>

          <div className="pb-1 text-xs text-muted-foreground">
            {workingRoom.widthFeet} × {workingRoom.lengthFeet} ft
            <span className="ml-1.5 font-medium text-foreground">· {floorplanRoomSquareFeet(workingRoom).toLocaleString()} sq ft</span>
            <span className="ml-1.5 text-[11px]">· canvas scales to fit</span>
          </div>
        </div>

        {workingRoom.shape === "custom" ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
            <span className="text-xs text-muted-foreground">Drag the yellow corner points to trace the room.</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const result = addRoomCorner(workingRoom.points);
                updateRoom({ points: result.points });
                setSelectedCorner(result.index);
              }}
              disabled={workingRoom.points.length >= 24}
            >
              <Plus className="mr-1.5 size-3.5" />
              Add corner
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (selectedCorner === null || workingRoom.points.length <= 3) return;
                updateRoom({ points: workingRoom.points.filter((_, index) => index !== selectedCorner) });
                setSelectedCorner(null);
              }}
              disabled={selectedCorner === null || workingRoom.points.length <= 3}
            >
              <Minus className="mr-1.5 size-3.5" />
              Remove corner
            </Button>
          </div>
        ) : null}
      </div>

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
              className="relative min-h-[360px] w-full overflow-hidden rounded-lg border border-hairline bg-muted/30"
              style={{ aspectRatio: visualAspectRatio }}
            >
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-surface-sunken shadow-inner"
                style={{
                  clipPath: roomClipPath(workingRoom),
                  backgroundImage:
                    "linear-gradient(to right, hsl(var(--hairline)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--hairline)) 1px, transparent 1px)",
                  backgroundSize: "5% 8.333%",
                }}
              />
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 size-full text-primary/70"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                {workingRoom.shape === "oval" ? (
                  <ellipse cx="50" cy="50" rx="48" ry="48" fill="none" stroke="currentColor" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                ) : (
                  <polygon
                    points={workingRoom.points.map((point) => `${point.x},${point.y}`).join(" ")}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="0.5"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </svg>

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
                    aria-label={`${spec.label} ${item.label}${item.seats ? `, ${item.seats} seats` : ""}${item.locked ? ", fixed in place" : ""}`}
                    aria-pressed={isSelected}
                    onPointerDown={(pointerEvent) => onPointerDown(pointerEvent, item)}
                    onFocus={() => setSelectedId(item.id)}
                    className={cn(
                      "absolute flex touch-none select-none items-center justify-center border text-center text-[10px] font-semibold leading-tight shadow-xs transition-shadow",
                      item.locked ? "cursor-default" : "cursor-grab active:cursor-grabbing",
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
                    {item.locked ? <Lock className="absolute right-1 top-1 size-2.5" aria-hidden="true" /> : null}
                  </div>
                );
              })}

              {workingRoom.shape === "custom"
                ? workingRoom.points.map((point, index) => (
                    <button
                      key={`corner-${index}`}
                      type="button"
                      aria-label={`Room corner ${index + 1}`}
                      aria-pressed={selectedCorner === index}
                      onPointerDown={(pointerEvent) => {
                        pointerEvent.stopPropagation();
                        setSelectedId(null);
                        setSelectedCorner(index);
                        cornerDragState.current = { index };
                        pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
                      }}
                      onKeyDown={(keyEvent) => {
                        const movement: Record<string, [number, number]> = {
                          ArrowUp: [0, -1],
                          ArrowDown: [0, 1],
                          ArrowLeft: [-1, 0],
                          ArrowRight: [1, 0],
                        };
                        const delta = movement[keyEvent.key];
                        if (!delta) return;
                        keyEvent.preventDefault();
                        const step = keyEvent.shiftKey ? 5 : 1;
                        updateRoomPoint(index, {
                          x: clamp(point.x + delta[0] * step),
                          y: clamp(point.y + delta[1] * step),
                        });
                      }}
                      className={cn(
                        "absolute z-30 size-4 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-surface bg-primary shadow-sm transition-transform hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        selectedCorner === index && "scale-125 ring-2 ring-ring ring-offset-2",
                      )}
                      style={{ left: `${point.x}%`, top: `${point.y}%` }}
                    />
                  ))
                : null}
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              Drag objects from the toolbar to place them inside the room outline. Select any object to lock or unlock
              its position, then use drag or the arrow keys to move it.
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateItem(selected.id, { locked: !selected.locked })}
              >
                {selected.locked ? <Unlock className="mr-1.5 size-3.5" /> : <Lock className="mr-1.5 size-3.5" />}
                {selected.locked ? "Unlock position" : "Lock position"}
              </Button>
              <Button variant="outline" size="sm" onClick={removeSelected} disabled={selected.locked}>
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

        {(
          <Button
            variant="outline"
            size="sm"
            disabled={deletePlan.isPending}
            onClick={() => {
              // Deleting a drawn room loses work, so it is confirmed. The last room is
              // deletable too: a room added by mistake would otherwise be stuck on the
              // event forever, and removing it lands on the empty state, which offers to
              // add one straight back.
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
        )}
      </div>

      <RoomEditor key={current.id} event={event} plan={current} />
    </div>
  );
}
