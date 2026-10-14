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
  ImagePlus,
  LayoutGrid,
  Lock,
  Minus,
  PenTool,
  Plus,
  RectangleHorizontal,
  RotateCcw,
  RotateCw,
  Save,
  Shapes,
  Type,
  Trash2,
  Unlock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { EmptyState, LoadingRows, Panel, PanelHeader, Pill } from "@/components/primitives";
import {
  useCreateFloorplan,
  useDeleteFloorplan,
  useFloorplans,
  useSaveFloorplan,
  useUploadAuctionImage,
} from "@/data/hooks";
import {
  FLOORPLAN_SHAPES,
  type Event,
  type Floorplan,
  type FloorplanCustomShapeMode,
  type FloorplanItem,
  type FloorplanPoint,
  type FloorplanRoom,
  type FloorplanRoomShape,
  type FloorplanShape,
} from "@/data/entities";
import { floorplanRoomSquareFeet } from "@/data/floorplan";
import {
  DEFAULT_FLOORPLAN_ROOM,
  DEFAULT_CUSTOM_OBJECT_POINTS,
  addRoomCorner,
  nearestPointInsideRoom,
  pointIsInsideRoom,
  rotationFromPointerAngles,
  roomClipPath,
  roomPointsForShape,
  smoothClosedPath,
} from "@/data/floorplanGeometry";
import EventSpreadsheetImportDialog from "../EventSpreadsheetImportDialog";

interface ShapeSpec {
  label: string;
  /** Width and height as a percentage of the room box. */
  width: number;
  height: number;
  seats: number | null;
  round: boolean;
  className: string;
}

interface InlineLabelEditorProps {
  value: string;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  ariaLabel: string;
  placeholder: string;
  className: string;
  multiline?: boolean;
  autoFocus?: boolean;
}

function InlineLabelEditor({
  value,
  onChange,
  onCommit,
  ariaLabel,
  placeholder,
  className,
  multiline = false,
  autoFocus = false,
}: InlineLabelEditorProps) {
  const shared = {
    value,
    placeholder,
    maxLength: 80,
    autoFocus,
    className,
    "aria-label": ariaLabel,
    onChange: (inputEvent: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(inputEvent.target.value),
    onBlur: (inputEvent: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => onCommit(inputEvent.target.value),
    onPointerDown: (pointerEvent: React.PointerEvent<HTMLInputElement | HTMLTextAreaElement>) => pointerEvent.stopPropagation(),
    onClick: (mouseEvent: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>) => mouseEvent.stopPropagation(),
  };

  return multiline ? <textarea {...shared} rows={2} /> : <input {...shared} />;
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
  "custom-shape": { label: "Custom shape", width: 18, height: 14, seats: null, round: false, className: "border-transparent bg-transparent text-info-text shadow-none" },
  image: { label: "Image", width: 18, height: 14, seats: null, round: false, className: "overflow-hidden border-primary/40 bg-surface text-foreground" },
  text: { label: "Text box", width: 20, height: 7, seats: null, round: false, className: "border-dashed border-primary/40 bg-surface/90 text-foreground" },
};

const clamp = (value: number) => Math.max(2, Math.min(98, value));

function suppressNextClick(ref: { current: boolean }) {
  ref.current = true;
  window.setTimeout(() => {
    ref.current = false;
  }, 0);
}

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

function openItemPosition(
  items: FloorplanItem[],
  room: FloorplanRoom,
  spec: ShapeSpec,
): FloorplanPoint {
  const candidates = [14, 26, 38, 50, 62, 74, 86].flatMap((y) =>
    [14, 26, 38, 50, 62, 74, 86].map((x) => ({ x, y })),
  );
  const rotated = [...candidates.slice(items.length % candidates.length), ...candidates.slice(0, items.length % candidates.length)];
  const open = rotated.find((candidate) => {
    if (!pointIsInsideRoom(room, candidate.x, candidate.y)) return false;
    return items.every((item) => {
      const itemSpec = SHAPES[item.shape];
      const horizontalClearance = ((item.width ?? itemSpec.width) + spec.width) / 2 + 2;
      const verticalClearance = ((item.height ?? itemSpec.height) + spec.height) / 2 + 2;
      return Math.abs(candidate.x - item.x) >= horizontalClearance || Math.abs(candidate.y - item.y) >= verticalClearance;
    });
  });

  return open ?? nearestPointInsideRoom(room, {
    x: clamp(20 + ((items.length * 13) % 60)),
    y: clamp(24 + ((items.length * 9) % 50)),
  });
}

/**
 * One room's editor. Remounted per room by the panel below (via `key`), so the local
 * unsaved state cannot leak from the terrace layout into the ballroom's.
 */
function RoomEditor({ event, plan: saved }: { event: Event; plan: Floorplan }) {
  const savePlan = useSaveFloorplan();
  const uploadImage = useUploadAuctionImage();

  const [name, setName] = useState<string | null>(null);
  const [items, setItems] = useState<FloorplanItem[] | null>(null);
  const [room, setRoom] = useState<FloorplanRoom | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCorner, setSelectedCorner] = useState<number | null>(null);
  const [selectedItemCorner, setSelectedItemCorner] = useState<number | null>(null);
  const [freehandDraft, setFreehandDraft] = useState<FloorplanPoint[] | null>(null);
  const roomRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const rotationDragState = useRef<{
    id: string;
    centerX: number;
    centerY: number;
    startPointerAngle: number;
    startRotation: number;
    moved: boolean;
  } | null>(null);
  const cornerDragState = useRef<{ index: number } | null>(null);
  const itemCornerDragState = useRef<{ id: string; index: number } | null>(null);
  const paletteDragState = useRef<{ shape: FloorplanShape; startX: number; startY: number } | null>(null);
  const suppressPaletteClick = useRef(false);
  const suppressRotationClick = useRef(false);
  const freehandDraftRef = useRef<FloorplanPoint[] | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Local edits win until saved or reset; otherwise mirror the stored plan. Memoized so
  // the derived values below don't recompute on every render.
  const workingItems = useMemo(() => items ?? saved?.items ?? [], [items, saved]);
  const workingItemsRef = useRef(workingItems);
  workingItemsRef.current = workingItems;
  const workingName = name ?? saved?.name ?? "Room layout";
  const workingRoom = useMemo(
    () => room ?? saved.room ?? DEFAULT_FLOORPLAN_ROOM,
    [room, saved.room],
  );
  const dirty = items !== null || name !== null || room !== null;

  const selected = workingItems.find((item) => item.id === selectedId) ?? null;
  const selectedCustomPoints = selected?.shape === "custom-shape"
    ? selected.points ?? DEFAULT_CUSTOM_OBJECT_POINTS
    : null;
  const selectedCustomMode: FloorplanCustomShapeMode = selected?.customShapeMode ?? "polygon";

  const seatTotal = useMemo(
    () => workingItems.reduce((total, item) => total + (item.seats ?? 0), 0),
    [workingItems],
  );

  const updateItem = (id: string, patch: Partial<FloorplanItem>) => {
    setItems(workingItems.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const normalizeLabel = (id: string, value: string, fallback: string) => {
    updateItem(id, { label: value.trim() || fallback });
  };

  const updateItemPoint = (id: string, index: number, point: FloorplanPoint) => {
    setItems(workingItems.map((item) => {
      if (item.id !== id) return item;
      const points = item.points ?? DEFAULT_CUSTOM_OBJECT_POINTS;
      return {
        ...item,
        points: points.map((current, currentIndex) => currentIndex === index ? point : current),
      };
    }));
  };

  const pointInDrawingPad = (
    pointerEvent: React.PointerEvent<HTMLDivElement>,
  ): FloorplanPoint => {
    const bounds = pointerEvent.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((pointerEvent.clientX - bounds.left) / bounds.width) * 100)),
      y: Math.max(0, Math.min(100, ((pointerEvent.clientY - bounds.top) / bounds.height) * 100)),
    };
  };

  const beginFreehand = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    if (!selected || selected.shape !== "custom-shape" || selected.locked || pointerEvent.button !== 0) return;
    const draft = [pointInDrawingPad(pointerEvent)];
    freehandDraftRef.current = draft;
    setFreehandDraft(draft);
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
  };

  const continueFreehand = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    const draft = freehandDraftRef.current;
    if (!draft || draft.length >= 256) return;
    const point = pointInDrawingPad(pointerEvent);
    const previous = draft.at(-1)!;
    if (Math.hypot(point.x - previous.x, point.y - previous.y) < 1.5) return;
    const next = [...draft, point];
    freehandDraftRef.current = next;
    setFreehandDraft(next);
  };

  const finishFreehand = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    const draft = freehandDraftRef.current;
    freehandDraftRef.current = null;
    if (pointerEvent.currentTarget.hasPointerCapture(pointerEvent.pointerId)) {
      pointerEvent.currentTarget.releasePointerCapture(pointerEvent.pointerId);
    }
    if (selected && draft && draft.length >= 3) {
      updateItem(selected.id, { customShapeMode: "freehand", points: draft });
    }
    setFreehandDraft(null);
  };

  const cancelFreehand = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    freehandDraftRef.current = null;
    setFreehandDraft(null);
    if (pointerEvent.currentTarget.hasPointerCapture(pointerEvent.pointerId)) {
      pointerEvent.currentTarget.releasePointerCapture(pointerEvent.pointerId);
    }
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

  const addShape = (
    shape: FloorplanShape,
    position?: { x: number; y: number },
    options?: Pick<FloorplanItem, "label" | "imageUrl">,
  ) => {
    const spec = SHAPES[shape];
    const currentItems = workingItemsRef.current;
    const sameShape = currentItems.filter((item) => item.shape === shape).length;
    const fallbackPosition = position
      ? nearestPointInsideRoom(workingRoom, { x: clamp(position.x), y: clamp(position.y) })
      : openItemPosition(currentItems, workingRoom, spec);
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
      rotation: 0,
      ...(shape === "custom-shape"
        ? { customShapeMode: "polygon" as const, points: DEFAULT_CUSTOM_OBJECT_POINTS.map((point) => ({ ...point })) }
        : {}),
      ...options,
    };
    setItems([...currentItems, item]);
    setSelectedId(item.id);
    setSelectedItemCorner(null);
    setFreehandDraft(null);
    freehandDraftRef.current = null;
  };

  const uploadFloorplanImage = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Choose an image file" });
      return;
    }
    if (file.size > 4_000_000) {
      toast({ title: "Image is too large", description: "Choose an image smaller than 4 MB." });
      return;
    }

    uploadImage.mutate(file, {
      onSuccess: (imageUrl) => {
        const filename = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
        addShape("image", undefined, {
          label: (filename || "Image").slice(0, 80),
          imageUrl,
        });
        toast({ title: "Image added", description: "Select it to resize or rotate it." });
      },
      onError: (error) => toast({ title: "Couldn't upload image", description: error.message }),
    });
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
    suppressNextClick(suppressPaletteClick);
    addShapeAtPointer(drag.shape, pointerEvent.clientX, pointerEvent.clientY);
  };

  const removeSelected = () => {
    if (!selected || selected.locked) return;
    setItems(workingItems.filter((item) => item.id !== selected.id));
    setSelectedId(null);
    setSelectedItemCorner(null);
    setFreehandDraft(null);
    freehandDraftRef.current = null;
  };

  /* --------------------------------------------------------------- dragging */

  const onPointerDown = (pointerEvent: React.PointerEvent<HTMLElement>, item: FloorplanItem) => {
    if (item.id !== selectedId) {
      setSelectedItemCorner(null);
      setFreehandDraft(null);
      freehandDraftRef.current = null;
    }
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

  const beginRotation = (pointerEvent: React.PointerEvent<HTMLButtonElement>, item: FloorplanItem) => {
    if (pointerEvent.button !== 0 || item.locked) return;
    const room = roomRef.current;
    if (!room) return;
    const rect = room.getBoundingClientRect();
    const centerX = rect.left + rect.width * (item.x / 100);
    const centerY = rect.top + rect.height * (item.y / 100);
    rotationDragState.current = {
      id: item.id,
      centerX,
      centerY,
      startPointerAngle: Math.atan2(pointerEvent.clientY - centerY, pointerEvent.clientX - centerX) * 180 / Math.PI,
      startRotation: item.rotation ?? 0,
      moved: false,
    };
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
  };

  const onPointerMove = (pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    const room = roomRef.current;
    if (!room) return;
    const rect = room.getBoundingClientRect();
    const rotationDrag = rotationDragState.current;
    if (rotationDrag) {
      const pointerAngle = Math.atan2(
        pointerEvent.clientY - rotationDrag.centerY,
        pointerEvent.clientX - rotationDrag.centerX,
      ) * 180 / Math.PI;
      const rotation = rotationFromPointerAngles(
        rotationDrag.startRotation,
        rotationDrag.startPointerAngle,
        pointerAngle,
      );
      if (rotation !== rotationDrag.startRotation) rotationDrag.moved = true;
      updateItem(rotationDrag.id, { rotation });
      return;
    }

    const cornerDrag = cornerDragState.current;
    if (cornerDrag) {
      updateRoomPoint(cornerDrag.index, {
        x: clamp(((pointerEvent.clientX - rect.left) / rect.width) * 100),
        y: clamp(((pointerEvent.clientY - rect.top) / rect.height) * 100),
      });
      return;
    }

    const itemCornerDrag = itemCornerDragState.current;
    if (itemCornerDrag) {
      const item = workingItems.find((current) => current.id === itemCornerDrag.id);
      if (!item) return;
      const spec = SHAPES[item.shape];
      const itemWidth = rect.width * ((item.width ?? spec.width) / 100);
      const itemHeight = rect.height * ((item.height ?? spec.height) / 100);
      const centerX = rect.left + rect.width * (item.x / 100);
      const centerY = rect.top + rect.height * (item.y / 100);
      const radians = -((item.rotation ?? 0) * Math.PI) / 180;
      const deltaX = pointerEvent.clientX - centerX;
      const deltaY = pointerEvent.clientY - centerY;
      const localX = deltaX * Math.cos(radians) - deltaY * Math.sin(radians);
      const localY = deltaX * Math.sin(radians) + deltaY * Math.cos(radians);
      updateItemPoint(item.id, itemCornerDrag.index, {
        x: Math.max(0, Math.min(100, 50 + (localX / itemWidth) * 100)),
        y: Math.max(0, Math.min(100, 50 + (localY / itemHeight) * 100)),
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
    if (rotationDragState.current?.moved) {
      suppressNextClick(suppressRotationClick);
    }
    dragState.current = null;
    rotationDragState.current = null;
    cornerDragState.current = null;
    itemCornerDragState.current = null;
  };

  /* ------------------------------------------------------------- keyboard */

  // The key handler reads through a ref so the listener attaches once and still sees the
  // current selection. Re-subscribing on every render would be the alternative, and
  // depending on `updateItem` (recreated each render) would do exactly that.
  const latest = useRef({ selected, workingItems, workingRoom });
  latest.current = { selected, workingItems, workingRoom };

  useEffect(() => {
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      const eventTarget = keyEvent.target as HTMLElement | null;
      if (eventTarget?.closest("input, textarea, select, button, [contenteditable='true']")) return;
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
                  setSelectedItemCorner(null);
                  setFreehandDraft(null);
                  freehandDraftRef.current = null;
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
        {FLOORPLAN_SHAPES.filter((shape) => shape !== "image").map((shape) => (
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
            {shape === "text" ? <Type className="mr-1 size-3.5" /> : <GripVertical className="mr-1 size-3" />}
            {SHAPES[shape].label}
          </Button>
        ))}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Choose a floorplan image"
          onChange={(inputEvent) => {
            const file = inputEvent.target.files?.[0];
            inputEvent.target.value = "";
            if (file) uploadFloorplanImage(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploadImage.isPending}
          onClick={() => imageInputRef.current?.click()}
        >
          <ImagePlus className="mr-1 size-3.5" />
          {uploadImage.isPending ? "Uploading image…" : "Upload image"}
        </Button>
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
                const width = item.width ?? spec.width;
                const height = item.height ?? spec.height;
                const customPoints = item.shape === "custom-shape"
                  ? item.points ?? DEFAULT_CUSTOM_OBJECT_POINTS
                  : null;
                const customMode: FloorplanCustomShapeMode = item.customShapeMode ?? "polygon";
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${spec.label} ${item.label}${item.seats ? `, ${item.seats} seats` : ""}, ${item.rotation ?? 0} degrees${item.locked ? ", fixed in place" : ""}`}
                    aria-pressed={isSelected}
                    onPointerDown={(pointerEvent) => onPointerDown(pointerEvent, item)}
                    onFocus={() => setSelectedId(item.id)}
                    className={cn(
                      "absolute flex touch-none select-none items-center justify-center border text-center text-[10px] font-semibold leading-tight shadow-xs transition-shadow",
                      item.locked ? "cursor-default" : "cursor-grab active:cursor-grabbing",
                      spec.round ? "rounded-full" : "rounded-md",
                      spec.className,
                      item.shape === "text" && "text-sm font-bold sm:text-base",
                      isSelected && "ring-2 ring-ring ring-offset-1",
                    )}
                    style={{
                      left: `${item.x}%`,
                      top: `${item.y}%`,
                      width: `${width}%`,
                      height: spec.round ? undefined : `${height}%`,
                      aspectRatio: spec.round ? "1 / 1" : undefined,
                      transform: `translate(-50%, -50%) rotate(${item.rotation ?? 0}deg)`,
                    }}
                  >
                    {item.shape === "image" && item.imageUrl ? (
                      <>
                        <img
                          src={item.imageUrl}
                          alt=""
                          draggable={false}
                          className="pointer-events-none absolute inset-0 size-full select-none rounded-[inherit] object-contain"
                        />
                        {isSelected ? (
                          <InlineLabelEditor
                            value={item.label}
                            onChange={(value) => updateItem(item.id, { label: value })}
                            onCommit={(value) => normalizeLabel(item.id, value, "Image")}
                            ariaLabel="Image name"
                            placeholder="Rename image"
                            className="absolute inset-x-1 bottom-1 z-10 min-w-0 rounded border border-primary/40 bg-surface/95 px-1 py-0.5 text-center text-[9px] font-semibold text-foreground shadow-xs outline-none focus:ring-2 focus:ring-ring/30"
                          />
                        ) : null}
                      </>
                    ) : item.shape === "text" ? (
                      isSelected ? (
                        <InlineLabelEditor
                          value={item.label}
                          onChange={(value) => updateItem(item.id, { label: value })}
                          onCommit={(value) => normalizeLabel(item.id, value, "Text box")}
                          ariaLabel="Floorplan text"
                          placeholder="Type text"
                          multiline
                          autoFocus
                          className="relative z-10 size-full resize-none overflow-hidden rounded border border-primary/40 bg-surface/95 px-2 py-1 text-center text-sm font-bold leading-tight text-foreground shadow-xs outline-none focus:border-primary focus:ring-2 focus:ring-ring/30 sm:text-base"
                        />
                      ) : (
                        <span className="whitespace-pre-wrap px-1 leading-tight">{item.label}</span>
                      )
                    ) : customPoints ? (
                      <>
                        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                          {customMode === "polygon" ? (
                            <polygon
                              points={customPoints.map((point) => `${point.x},${point.y}`).join(" ")}
                              className="fill-info-tint stroke-info/60"
                              strokeWidth="2"
                              vectorEffect="non-scaling-stroke"
                            />
                          ) : (
                            <path
                              d={smoothClosedPath(customPoints)}
                              className="fill-info-tint stroke-info/60"
                              strokeWidth="2"
                              vectorEffect="non-scaling-stroke"
                            />
                          )}
                        </svg>
                        {isSelected ? (
                          <InlineLabelEditor
                            value={item.label}
                            onChange={(value) => updateItem(item.id, { label: value })}
                            onCommit={(value) => normalizeLabel(item.id, value, "Custom shape")}
                            ariaLabel="Label inside custom shape"
                            placeholder="Type a label"
                            multiline
                            className="relative z-10 mx-2 min-w-0 resize-none rounded border border-info/40 bg-surface/90 px-1.5 py-1 text-center text-[10px] font-semibold leading-tight text-foreground shadow-xs outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
                          />
                        ) : (
                          <span className="relative z-10 px-2">{item.label}</span>
                        )}
                        {isSelected && !item.locked && customMode !== "freehand"
                          ? customPoints.map((point, index) => (
                              <button
                                key={`${item.id}-corner-${index}`}
                                type="button"
                                aria-label={`Custom shape corner ${index + 1}`}
                                aria-pressed={selectedItemCorner === index}
                                onPointerDown={(pointerEvent) => {
                                  pointerEvent.stopPropagation();
                                  setSelectedItemCorner(index);
                                  itemCornerDragState.current = { id: item.id, index };
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
                                  keyEvent.stopPropagation();
                                  const step = keyEvent.shiftKey ? 5 : 1;
                                  updateItemPoint(item.id, index, {
                                    x: Math.max(0, Math.min(100, point.x + delta[0] * step)),
                                    y: Math.max(0, Math.min(100, point.y + delta[1] * step)),
                                  });
                                }}
                                className={cn(
                                  "absolute z-20 size-3 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-surface bg-primary shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  selectedItemCorner === index && "scale-125 ring-2 ring-ring",
                                )}
                                style={{ left: `${point.x}%`, top: `${point.y}%` }}
                              />
                            ))
                          : null}
                      </>
                    ) : isSelected ? (
                      <InlineLabelEditor
                        value={item.label}
                        onChange={(value) => updateItem(item.id, { label: value })}
                        onCommit={(value) => normalizeLabel(item.id, value, spec.label)}
                        ariaLabel="Shape name"
                        placeholder="Rename shape"
                        multiline
                        className="relative z-10 mx-1 min-w-0 resize-none overflow-hidden rounded border border-primary/40 bg-surface/95 px-1 py-0.5 text-center text-[10px] font-semibold leading-tight text-foreground shadow-xs outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
                      />
                    ) : (
                      <span className="px-1">{item.label}</span>
                    )}
                    {isSelected && !item.locked ? (
                      <>
                        <button
                          type="button"
                          aria-label={`Move ${spec.label.toLowerCase()}`}
                          title={`Drag to move ${spec.label.toLowerCase()}`}
                          onPointerDown={(pointerEvent) => {
                            pointerEvent.stopPropagation();
                            onPointerDown(pointerEvent, item);
                          }}
                          className="absolute -top-7 left-1/2 z-30 flex h-6 -translate-x-1/2 touch-none items-center gap-1 rounded-full border border-hairline bg-surface px-2 text-[10px] font-medium text-muted-foreground shadow-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <GripVertical className="size-3" />
                          Move
                        </button>
                        <button
                          type="button"
                          aria-label={`Rotate ${spec.label.toLowerCase()}`}
                          title="Drag to rotate, or click for 15 degrees"
                          onPointerDown={(pointerEvent) => {
                            pointerEvent.stopPropagation();
                            beginRotation(pointerEvent, item);
                          }}
                          onClick={(mouseEvent) => {
                            mouseEvent.stopPropagation();
                            if (suppressRotationClick.current) return;
                            updateItem(item.id, { rotation: ((item.rotation ?? 0) + 15) % 360 });
                          }}
                          className="absolute right-1 top-1 z-30 grid size-8 touch-none place-items-center rounded-full border border-primary/40 bg-surface text-foreground shadow-md hover:bg-primary-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          style={{ transform: `rotate(${-(item.rotation ?? 0)}deg)` }}
                        >
                          <RotateCw className="size-4" />
                        </button>
                      </>
                    ) : null}
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
                        setSelectedItemCorner(null);
                        setFreehandDraft(null);
                        freehandDraftRef.current = null;
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
              Select any shape and type its new name directly inside it. Add a Text box for section labels, then move,
              resize, or rotate it like any other object. The circular handle on a selected item rotates it directly.
              Select an uploaded image to rename, resize, or rotate it.
            </p>
          </div>

          {selected ? (
            <div className="flex flex-wrap items-end gap-3 border-t border-hairline bg-surface-sunken px-5 py-3">
              <label className="space-y-1">
                <span className="block text-xs font-medium text-muted-foreground">
                  {SHAPES[selected.shape].label} label
                </span>
                {selected.shape === "text" ? (
                  <Textarea
                    value={selected.label}
                    onChange={(inputEvent) => updateItem(selected.id, { label: inputEvent.target.value })}
                    onBlur={(inputEvent) => normalizeLabel(selected.id, inputEvent.target.value, "Text box")}
                    aria-label="Floorplan text"
                    rows={2}
                    maxLength={80}
                    className="min-h-16 w-52 resize-none py-2"
                  />
                ) : (
                  <Input
                    value={selected.label}
                    onChange={(inputEvent) => updateItem(selected.id, { label: inputEvent.target.value })}
                    onBlur={(inputEvent) => normalizeLabel(selected.id, inputEvent.target.value, SHAPES[selected.shape].label)}
                    aria-label="Object label"
                    maxLength={80}
                    className="h-8 w-40"
                  />
                )}
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
              <label className="space-y-1">
                <span className="block text-xs font-medium text-muted-foreground">Width</span>
                <Input
                  value={String(selected.width ?? SHAPES[selected.shape].width)}
                  onChange={(inputEvent) => {
                    const parsed = Number(inputEvent.target.value);
                    updateItem(selected.id, {
                      width: Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 1,
                    });
                  }}
                  type="number"
                  min="1"
                  max="100"
                  aria-label="Object width percent"
                  className="h-8 w-20 text-right"
                />
              </label>
              {!SHAPES[selected.shape].round ? (
                <label className="space-y-1">
                  <span className="block text-xs font-medium text-muted-foreground">Height</span>
                  <Input
                    value={String(selected.height ?? SHAPES[selected.shape].height)}
                    onChange={(inputEvent) => {
                      const parsed = Number(inputEvent.target.value);
                      updateItem(selected.id, {
                        height: Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 1,
                      });
                    }}
                    type="number"
                    min="1"
                    max="100"
                    aria-label="Object height percent"
                    className="h-8 w-20 text-right"
                  />
                </label>
              ) : null}
              <div className="space-y-1">
                <span className="block text-xs font-medium text-muted-foreground">
                  {selected.shape === "image" ? "Image rotation" : selected.shape === "text" ? "Text rotation" : "Rotation"}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-8"
                    aria-label="Rotate object left 15 degrees"
                    disabled={selected.locked}
                    onClick={() => updateItem(selected.id, { rotation: ((selected.rotation ?? 0) + 345) % 360 })}
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                  <Input
                    value={String(selected.rotation ?? 0)}
                    onChange={(inputEvent) => {
                      const parsed = Number(inputEvent.target.value);
                      updateItem(selected.id, {
                        rotation: Number.isFinite(parsed) ? Math.max(0, Math.min(359, Math.round(parsed))) : 0,
                      });
                    }}
                    type="number"
                    min="0"
                    max="359"
                    aria-label="Object rotation in degrees"
                    disabled={selected.locked}
                    className="h-8 w-20 text-right tabular-nums"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-8"
                    aria-label="Rotate object right 15 degrees"
                    disabled={selected.locked}
                    onClick={() => updateItem(selected.id, { rotation: ((selected.rotation ?? 0) + 15) % 360 })}
                  >
                    <RotateCw className="size-3.5" />
                  </Button>
                </div>
              </div>
              {selectedCustomPoints ? (
                <div className="basis-full rounded-lg border border-hairline bg-surface p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Outline</span>
                    <div className="flex rounded-md border border-hairline bg-surface-sunken p-0.5">
                      {(["polygon", "curved", "freehand"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          aria-pressed={selectedCustomMode === mode}
                          disabled={selected.locked}
                          onClick={() => {
                            updateItem(selected.id, { customShapeMode: mode });
                            setSelectedItemCorner(null);
                            setFreehandDraft(null);
                            freehandDraftRef.current = null;
                          }}
                          className={cn(
                            "rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                            selectedCustomMode === mode
                              ? "bg-secondary text-secondary-foreground shadow-xs"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {mode === "polygon" ? "Straight" : mode}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {selectedCustomMode === "freehand"
                        ? "Draw a closed outline in the pad below."
                        : "Drag the yellow anchor points directly on the floor plan."}
                    </span>
                  </div>

                  {selectedCustomMode === "freehand" ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(240px,360px)_1fr] sm:items-center">
                      <div
                        role="application"
                        tabIndex={0}
                        aria-label="Freehand shape drawing pad. Drag to replace the current outline."
                        onPointerDown={beginFreehand}
                        onPointerMove={continueFreehand}
                        onPointerUp={finishFreehand}
                        onPointerCancel={cancelFreehand}
                        className={cn(
                          "relative h-32 touch-none overflow-hidden rounded-md border border-dashed border-info/60 bg-info-tint/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected.locked ? "cursor-not-allowed opacity-60" : "cursor-crosshair",
                        )}
                      >
                        <svg aria-hidden="true" className="absolute inset-2 size-[calc(100%-1rem)]" viewBox="0 0 100 100" preserveAspectRatio="none">
                          {(freehandDraft ?? selectedCustomPoints).length >= 3 ? (
                            <path
                              d={smoothClosedPath(freehandDraft ?? selectedCustomPoints)}
                              className="fill-info/15 stroke-info"
                              strokeWidth="2"
                              vectorEffect="non-scaling-stroke"
                            />
                          ) : (
                            <polyline
                              points={(freehandDraft ?? []).map((point) => `${point.x},${point.y}`).join(" ")}
                              fill="none"
                              className="stroke-info"
                              strokeWidth="2"
                              vectorEffect="non-scaling-stroke"
                            />
                          )}
                        </svg>
                        {!freehandDraft ? (
                          <span className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[11px] font-medium text-info-text">
                            Drag here to redraw
                          </span>
                        ) : null}
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p>Press and drag once around the object. Release to close and save the outline.</p>
                        <p>Use width, height, and rotation above to place it precisely in the room.</p>
                        <Pill tone="neutral">{selectedCustomPoints.length} sampled points</Pill>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center gap-1">
                      <Pill tone="neutral">{selectedCustomPoints.length} anchors</Pill>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={selected.locked || selectedCustomPoints.length >= 24}
                        onClick={() => {
                          const result = addRoomCorner(selectedCustomPoints);
                          updateItem(selected.id, { points: result.points });
                          setSelectedItemCorner(result.index);
                        }}
                      >
                        <Plus className="mr-1 size-3.5" />
                        Add anchor
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={selected.locked || selectedItemCorner === null || selectedCustomPoints.length <= 3}
                        onClick={() => {
                          if (selectedItemCorner === null) return;
                          updateItem(selected.id, { points: selectedCustomPoints.filter((_, index) => index !== selectedItemCorner) });
                          setSelectedItemCorner(null);
                        }}
                      >
                        <Minus className="mr-1 size-3.5" />
                        Remove anchor
                      </Button>
                    </div>
                  )}
                </div>
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
        <PanelHeader title="Floorplan" description="No rooms yet" actions={<EventSpreadsheetImportDialog event={event} />} />
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

        <EventSpreadsheetImportDialog event={event} />

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
