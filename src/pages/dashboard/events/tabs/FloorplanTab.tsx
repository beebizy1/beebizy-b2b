import { useState, useRef, useEffect, useCallback } from "react";
import {
  useGetEventFloorplan,
  useSaveEventFloorplan,
  getGetEventFloorplanQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Save, Trash2, RotateCcw } from "lucide-react";
import { QueryError } from "@/components/QueryError";

const CANVAS_W = 820;
const CANVAS_H = 540;

type ShapeType = "circle" | "rect";

interface ElementDef {
  type: string;
  label: string;
  w: number;
  h: number;
  color: string;
  shape: ShapeType;
  seats?: number;
  group: string;
}

const ELEMENT_TYPES: ElementDef[] = [
  { type: "round_sm", label: "Round (6)", w: 72, h: 72, color: "#dbeafe", shape: "circle", seats: 6, group: "Tables" },
  { type: "round_lg", label: "Round (8)", w: 90, h: 90, color: "#bfdbfe", shape: "circle", seats: 8, group: "Tables" },
  { type: "rect", label: "Rectangle", w: 110, h: 68, color: "#dbeafe", shape: "rect", seats: 10, group: "Tables" },
  { type: "long", label: "Long Table", w: 165, h: 48, color: "#dbeafe", shape: "rect", seats: 14, group: "Tables" },
  { type: "stage", label: "Stage", w: 200, h: 80, color: "#fef3c7", shape: "rect", group: "Stage" },
  { type: "podium", label: "Podium", w: 52, h: 52, color: "#fde68a", shape: "rect", group: "Stage" },
  { type: "bar", label: "Bar", w: 150, h: 50, color: "#fed7aa", shape: "rect", group: "Service" },
  { type: "buffet", label: "Buffet", w: 180, h: 50, color: "#fed7aa", shape: "rect", group: "Service" },
  { type: "photo_booth", label: "Photo Booth", w: 80, h: 80, color: "#fce7f3", shape: "rect", group: "Service" },
  { type: "dance_floor", label: "Dance Floor", w: 160, h: 120, color: "#ede9fe", shape: "rect", group: "Zones" },
  { type: "vip", label: "VIP Area", w: 130, h: 90, color: "#fef9c3", shape: "rect", group: "Zones" },
  { type: "entrance", label: "Entrance", w: 100, h: 40, color: "#d1fae5", shape: "rect", group: "Flow" },
  { type: "exit", label: "Exit", w: 100, h: 40, color: "#fee2e2", shape: "rect", group: "Flow" },
  { type: "registration", label: "Registration", w: 120, h: 50, color: "#d1fae5", shape: "rect", group: "Flow" },
];

interface FloorElement {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  color: string;
  shape: ShapeType;
  seats?: number;
}

interface FloorLayout {
  elements: FloorElement[];
  roomWidth: number;
  roomHeight: number;
  roomLabel: string;
}

const DEFAULT_LAYOUT: FloorLayout = {
  elements: [],
  roomWidth: CANVAS_W,
  roomHeight: CANVAS_H,
  roomLabel: "Main Room",
};

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

interface Props { eventId: string }

export function FloorplanTab({ eventId }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const canvasRef = useRef<HTMLDivElement>(null);

  const { data: floorplanData, isLoading, isError, error } = useGetEventFloorplan(eventId, {
    query: { enabled: !!eventId, queryKey: getGetEventFloorplanQueryKey(eventId) },
  });
  const saveFloorplan = useSaveEventFloorplan();

  const [layout, setLayout] = useState<FloorLayout>(DEFAULT_LAYOUT);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [roomLabel, setRoomLabel] = useState("Main Room");
  const [isDirty, setIsDirty] = useState(false);
  const draggingRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    if (floorplanData?.layout) {
      const loaded = floorplanData.layout as Partial<FloorLayout>;
      setLayout({
        elements: loaded.elements ?? [],
        roomWidth: loaded.roomWidth ?? CANVAS_W,
        roomHeight: loaded.roomHeight ?? CANVAS_H,
        roomLabel: loaded.roomLabel ?? "Main Room",
      });
      setRoomLabel(loaded.roomLabel ?? "Main Room");
      setIsDirty(false);
    }
  }, [floorplanData]);

  const elements = layout.elements;
  const selectedEl = elements.find((e) => e.id === selectedId) ?? null;

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const { id, offsetX, offsetY } = draggingRef.current;
    setLayout((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => {
        if (el.id !== id) return el;
        return {
          ...el,
          x: Math.max(0, Math.min(CANVAS_W - el.w, e.clientX - rect.left - offsetX)),
          y: Math.max(0, Math.min(CANVAS_H - el.h, e.clientY - rect.top - offsetY)),
        };
      }),
    }));
    setIsDirty(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const startDrag = (e: React.MouseEvent, el: FloorElement) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    draggingRef.current = {
      id: el.id,
      offsetX: e.clientX - rect.left - el.x,
      offsetY: e.clientY - rect.top - el.y,
    };
    setSelectedId(el.id);
    setEditLabel(el.label);
  };

  const addElement = (def: ElementDef) => {
    const newEl: FloorElement = {
      id: generateId(),
      type: def.type,
      x: Math.floor(Math.random() * (CANVAS_W - def.w - 120)) + 60,
      y: Math.floor(Math.random() * (CANVAS_H - def.h - 80)) + 40,
      w: def.w,
      h: def.h,
      label: def.label,
      color: def.color,
      shape: def.shape,
      seats: def.seats,
    };
    setLayout((prev) => ({ ...prev, elements: [...prev.elements, newEl] }));
    setSelectedId(newEl.id);
    setEditLabel(newEl.label);
    setIsDirty(true);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setLayout((prev) => ({ ...prev, elements: prev.elements.filter((e) => e.id !== selectedId) }));
    setSelectedId(null);
    setIsDirty(true);
  };

  const updateLabel = (value: string) => {
    setEditLabel(value);
    if (!selectedId) return;
    setLayout((prev) => ({
      ...prev,
      elements: prev.elements.map((e) => e.id === selectedId ? { ...e, label: value } : e),
    }));
    setIsDirty(true);
  };

  const handleSave = () => {
    const newLayout: FloorLayout = { ...layout, roomLabel };
    saveFloorplan.mutate(
      { id: eventId, data: { name: roomLabel || "Main Layout", layout: newLayout as unknown as Record<string, unknown> } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetEventFloorplanQueryKey(eventId) });
          setIsDirty(false);
          toast({ title: "Floorplan saved" });
        },
        onError: () => toast({ title: "Failed to save floorplan", variant: "destructive" }),
      }
    );
  };

  const clearCanvas = () => {
    setLayout((prev) => ({ ...prev, elements: [] }));
    setSelectedId(null);
    setIsDirty(true);
  };

  const groups = Array.from(new Set(ELEMENT_TYPES.map((e) => e.group)));

  if (isError) return <QueryError error={error} label="Failed to load floorplan." />;
  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Room Name</label>
            <Input
              value={roomLabel}
              onChange={(e) => { setRoomLabel(e.target.value); setIsDirty(true); }}
              className="text-sm h-8 w-44"
              placeholder="Main Room"
            />
          </div>
          <div className="text-xs text-muted-foreground mt-5">
            {elements.length} element{elements.length !== 1 ? "s" : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {elements.length > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground" onClick={clearCanvas}>
              <RotateCcw className="w-3.5 h-3.5" /> Clear
            </Button>
          )}
          <Button
            size="sm"
            className="gap-1.5"
            onClick={handleSave}
            disabled={saveFloorplan.isPending || !isDirty}
          >
            <Save className="w-3.5 h-3.5" />
            {saveFloorplan.isPending ? "Saving..." : isDirty ? "Save Layout" : "Saved"}
          </Button>
        </div>
      </div>

      {/* Main editor */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {/* Palette */}
        <div className="w-36 shrink-0 space-y-3">
          {groups.map((group) => (
            <div key={group}>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{group}</div>
              <div className="space-y-1">
                {ELEMENT_TYPES.filter((e) => e.group === group).map((def) => (
                  <button
                    key={def.type}
                    onClick={() => addElement(def)}
                    className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border hover:border-primary/60 hover:bg-primary/5 text-xs font-medium transition-colors"
                  >
                    <span
                      className={`shrink-0 border border-black/10 ${def.shape === "circle" ? "rounded-full" : "rounded-sm"}`}
                      style={{ width: 14, height: 14, background: def.color, display: "inline-block" }}
                    />
                    {def.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="pt-1 text-xs text-muted-foreground leading-tight opacity-70">
            Click to add. Drag on canvas to reposition.
          </div>
        </div>

        {/* Canvas area */}
        <div className="flex-1 min-w-0">
          <div
            ref={canvasRef}
            className="relative border-2 border-border rounded-xl overflow-hidden select-none"
            style={{
              width: CANVAS_W,
              height: CANVAS_H,
              background: "#fafafa",
              backgroundImage: `
                linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)
              `,
              backgroundSize: "30px 30px",
            }}
            onClick={() => setSelectedId(null)}
          >
            {/* Room label */}
            <div className="absolute top-2.5 left-3 text-xs font-semibold text-slate-400 pointer-events-none select-none">
              {roomLabel}
            </div>

            {elements.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center text-slate-400">
                  <div className="text-sm font-medium">Empty floorplan</div>
                  <div className="text-xs mt-1">Click elements from the left palette to add them</div>
                </div>
              </div>
            )}

            {elements.map((el) => {
              const isSelected = el.id === selectedId;
              return (
                <div
                  key={el.id}
                  onMouseDown={(e) => startDrag(e, el)}
                  onClick={(e) => { e.stopPropagation(); setSelectedId(el.id); setEditLabel(el.label); }}
                  style={{
                    position: "absolute",
                    left: el.x,
                    top: el.y,
                    width: el.w,
                    height: el.h,
                    background: el.color,
                    borderRadius: el.shape === "circle" ? "50%" : 8,
                    border: isSelected ? "2.5px solid #6366f1" : "1.5px solid rgba(0,0,0,0.15)",
                    cursor: "grab",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: isSelected
                      ? "0 0 0 3px rgba(99,102,241,0.2), 0 2px 8px rgba(0,0,0,0.12)"
                      : "0 1px 4px rgba(0,0,0,0.1)",
                    userSelect: "none",
                    zIndex: isSelected ? 10 : 1,
                    transition: "box-shadow 0.1s",
                  }}
                >
                  <div style={{ textAlign: "center", padding: "2px 4px", pointerEvents: "none" }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#374151", lineHeight: 1.3, wordBreak: "break-word" }}>
                      {el.label}
                    </div>
                    {el.seats != null && (
                      <div style={{ fontSize: 9, color: "#6b7280", marginTop: 1 }}>{el.seats} seats</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Properties bar for selected element */}
          {selectedEl ? (
            <div className="mt-2 flex items-center gap-3 px-3 py-2 bg-muted/30 rounded-lg border border-border">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <label className="text-xs text-muted-foreground shrink-0">Label</label>
                <Input
                  value={editLabel}
                  onChange={(e) => updateLabel(e.target.value)}
                  className="h-7 text-xs"
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
              {selectedEl.seats != null && (
                <div className="flex items-center gap-2 shrink-0">
                  <label className="text-xs text-muted-foreground">Seats</label>
                  <Input
                    type="number"
                    value={selectedEl.seats}
                    onChange={(e) => {
                      const seats = parseInt(e.target.value) || 0;
                      setLayout((prev) => ({
                        ...prev,
                        elements: prev.elements.map((el) => el.id === selectedId ? { ...el, seats } : el),
                      }));
                      setIsDirty(true);
                    }}
                    className="h-7 text-xs w-16"
                  />
                </div>
              )}
              <div className="text-xs text-muted-foreground shrink-0 font-mono">
                {Math.round(selectedEl.x)}, {Math.round(selectedEl.y)}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                onClick={deleteSelected}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <div className="mt-2 px-3 py-1.5 text-xs text-muted-foreground">
              Click an element to select and edit it. Press Save Layout when done.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
