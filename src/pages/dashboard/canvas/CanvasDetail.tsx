import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useRoute } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useCanvas, DEFAULT_CANVAS_LAYOUT, type CanvasLayout, type CanvasElement, type ShapeType } from "@/hooks/use-canvases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Trash2, RotateCcw, LayoutGrid, ZoomIn, ZoomOut } from "lucide-react";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.1;
const VIEWPORT_HEIGHT = 620;

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

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

export default function CanvasDetail() {
  const [, params] = useRoute("/dashboard/canvas/:id");
  const id = params?.id ?? "";
  const { canvas, saveLayout } = useCanvas(id);
  const { toast } = useToast();
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const [layout, setLayout] = useState<CanvasLayout>(DEFAULT_CANVAS_LAYOUT);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const draggingRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const resizingRef = useRef<{ id: string; startX: number; startY: number; startW: number; startH: number; uniform: boolean } | null>(null);
  const panningRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);

  useEffect(() => {
    if (canvas && !initialized) {
      setLayout(canvas.layout);
      setInitialized(true);
    }
  }, [canvas, initialized]);

  const elements = layout.elements;
  const selectedEl = elements.find((e) => e.id === selectedId) ?? null;

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (panningRef.current) {
      const { startX, startY, startPanX, startPanY } = panningRef.current;
      setPan({ x: startPanX + (e.clientX - startX), y: startPanY + (e.clientY - startY) });
      return;
    }

    if (resizingRef.current) {
      const { id: resizeId, startX, startY, startW, startH, uniform } = resizingRef.current;
      const dx = (e.clientX - startX) / zoom;
      const dy = (e.clientY - startY) / zoom;
      setLayout((prev) => ({
        ...prev,
        elements: prev.elements.map((el) => {
          if (el.id !== resizeId) return el;
          let newW = Math.max(1, startW + dx);
          let newH = Math.max(1, startH + dy);
          if (uniform) {
            const size = Math.max(newW, newH);
            newW = size;
            newH = size;
          }
          return { ...el, w: newW, h: newH };
        }),
      }));
      setIsDirty(true);
      return;
    }

    if (!draggingRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const { id: dragId, offsetX, offsetY } = draggingRef.current;
    setLayout((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => {
        if (el.id !== dragId) return el;
        return {
          ...el,
          x: (e.clientX - rect.left) / zoom - offsetX,
          y: (e.clientY - rect.top) / zoom - offsetY,
        };
      }),
    }));
    setIsDirty(true);
  }, [zoom]);

  const handleMouseUp = useCallback(() => {
    draggingRef.current = null;
    resizingRef.current = null;
    panningRef.current = null;
    setIsPanning(false);
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const startDrag = (e: React.MouseEvent, el: CanvasElement) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    draggingRef.current = {
      id: el.id,
      offsetX: (e.clientX - rect.left) / zoom - el.x,
      offsetY: (e.clientY - rect.top) / zoom - el.y,
    };
    setSelectedId(el.id);
    setEditLabel(el.label);
  };

  const startResize = (e: React.MouseEvent, el: CanvasElement) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = {
      id: el.id,
      startX: e.clientX,
      startY: e.clientY,
      startW: el.w,
      startH: el.h,
      uniform: el.shape === "circle",
    };
    setSelectedId(el.id);
    setEditLabel(el.label);
  };

  const startPan = (e: React.MouseEvent) => {
    panningRef.current = { startX: e.clientX, startY: e.clientY, startPanX: pan.x, startPanY: pan.y };
    setIsPanning(true);
  };

  const addElement = (def: ElementDef) => {
    let x = 100;
    let y = 100;
    const viewportRect = viewportRef.current?.getBoundingClientRect();
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (viewportRect && canvasRect) {
      const screenCenterX = viewportRect.left + viewportRect.width / 2;
      const screenCenterY = viewportRect.top + viewportRect.height / 2;
      x = (screenCenterX - canvasRect.left) / zoom - def.w / 2 + (Math.random() - 0.5) * 40;
      y = (screenCenterY - canvasRect.top) / zoom - def.h / 2 + (Math.random() - 0.5) * 40;
    }
    const newEl: CanvasElement = {
      id: generateId(),
      type: def.type,
      x,
      y,
      w: def.w,
      h: def.h,
      label: def.label,
      color: def.color,
      shape: def.shape,
      // Only set `seats` when the element actually has one — Firestore rejects writes
      // containing `undefined` anywhere in the document (even nested in an array item).
      ...(def.seats != null ? { seats: def.seats } : {}),
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
      elements: prev.elements.map((e) => (e.id === selectedId ? { ...e, label: value } : e)),
    }));
    setIsDirty(true);
  };

  const updateColor = (value: string) => {
    if (!selectedId) return;
    setLayout((prev) => ({
      ...prev,
      elements: prev.elements.map((e) => (e.id === selectedId ? { ...e, color: value } : e)),
    }));
    setIsDirty(true);
  };

  const updateSize = (dimension: "w" | "h", value: number) => {
    if (!selectedId) return;
    const size = Math.max(1, value || 1);
    setLayout((prev) => ({
      ...prev,
      elements: prev.elements.map((e) => {
        if (e.id !== selectedId) return e;
        if (e.shape === "circle") return { ...e, w: size, h: size };
        return { ...e, [dimension]: size };
      }),
    }));
    setIsDirty(true);
  };

  const zoomBy = (delta: number) => {
    setZoom((prevZoom) => {
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((prevZoom + delta) * 100) / 100));
      if (newZoom === prevZoom) return prevZoom;

      const rect = viewportRef.current?.getBoundingClientRect();
      if (rect) {
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const scale = newZoom / prevZoom;
        setPan((prevPan) => ({
          x: centerX - scale * (centerX - prevPan.x),
          y: centerY - scale * (centerY - prevPan.y),
        }));
      }
      return newZoom;
    });
  };
  const zoomIn = () => zoomBy(ZOOM_STEP);
  const zoomOut = () => zoomBy(-ZOOM_STEP);
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleSave = () => {
    saveLayout(layout);
    setIsDirty(false);
    toast({ title: "Inspiration card saved" });
  };

  const clearCanvas = () => {
    setLayout((prev) => ({ ...prev, elements: [] }));
    setSelectedId(null);
    setIsDirty(true);
  };

  const groups = Array.from(new Set(ELEMENT_TYPES.map((e) => e.group)));

  if (!canvas) {
    return (
      <AppLayout>
        <div className="p-8 max-w-3xl mx-auto text-center text-muted-foreground py-20">
          <LayoutGrid className="w-10 h-10 mx-auto mb-3 opacity-30" />
          Inspiration card not found.
          <div className="mt-4">
            <Link href="/dashboard/canvas">
              <Button variant="outline" size="sm">Back to Inspiration Cards</Button>
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-8 max-w-6xl w-full mx-auto">
        <div className="mb-6">
          <Link href="/dashboard/canvas">
            <Button variant="ghost" size="sm" className="gap-2 -ml-3">
              <ArrowLeft className="w-4 h-4" />
              Back to Inspiration Cards
            </Button>
          </Link>
        </div>

        <h1 className="text-3xl font-bold tracking-tight mb-6">{canvas.name}</h1>

        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="text-xs text-muted-foreground">
                {elements.length} element{elements.length !== 1 ? "s" : ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 border border-border rounded-md p-0.5">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomOut} disabled={zoom <= MIN_ZOOM}>
                  <ZoomOut className="w-3.5 h-3.5" />
                </Button>
                <button
                  onClick={resetView}
                  className="text-xs font-mono text-muted-foreground w-11 text-center hover:text-foreground transition-colors"
                  title="Reset zoom and view"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomIn} disabled={zoom >= MAX_ZOOM}>
                  <ZoomIn className="w-3.5 h-3.5" />
                </Button>
              </div>
              {elements.length > 0 && (
                <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground" onClick={clearCanvas}>
                  <RotateCcw className="w-3.5 h-3.5" /> Clear
                </Button>
              )}
              <Button
                size="sm"
                className="gap-1.5"
                onClick={handleSave}
                disabled={!isDirty}
              >
                <Save className="w-3.5 h-3.5" />
                {isDirty ? "Save Layout" : "Saved"}
              </Button>
            </div>
          </div>

          {/* Main editor */}
          <div className="flex items-start gap-3 pb-2">
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
                Click to add. Drag an element to reposition it, its corner handle to resize it. Drag empty space to pan the canvas.
              </div>
            </div>

            {/* Canvas area */}
            <div className="flex-1 min-w-0">
              <div
                ref={viewportRef}
                className="relative border-2 border-border rounded-xl overflow-hidden select-none"
                style={{
                  width: "100%",
                  height: VIEWPORT_HEIGHT,
                  background: "#fafafa",
                  backgroundImage: `
                    linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)
                  `,
                  backgroundSize: `${30 * zoom}px ${30 * zoom}px`,
                  backgroundPosition: `${pan.x}px ${pan.y}px`,
                  cursor: isPanning ? "grabbing" : "grab",
                }}
                onMouseDown={startPan}
                onClick={() => setSelectedId(null)}
              >
                <div
                  ref={canvasRef}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: "0 0",
                  }}
                >
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
                        {isSelected && (
                          <div
                            onMouseDown={(e) => startResize(e, el)}
                            onClick={(e) => e.stopPropagation()}
                            title="Drag to resize"
                            style={{
                              position: "absolute",
                              right: -5,
                              bottom: -5,
                              width: 12,
                              height: 12,
                              borderRadius: 3,
                              background: "#6366f1",
                              border: "1.5px solid white",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                              cursor: "nwse-resize",
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {elements.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center text-slate-400">
                      <div className="text-sm font-medium">Empty inspiration card</div>
                      <div className="text-xs mt-1">Click elements from the left palette to add them</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Properties bar for selected element */}
              {selectedEl ? (
                <div className="mt-2 flex items-center gap-3 px-3 py-2 bg-muted/30 rounded-lg border border-border flex-wrap">
                  <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                    <label className="text-xs text-muted-foreground shrink-0">Label</label>
                    <Input
                      value={editLabel}
                      onChange={(e) => updateLabel(e.target.value)}
                      className="h-7 text-xs"
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <label className="text-xs text-muted-foreground">Color</label>
                    <input
                      type="color"
                      value={selectedEl.color}
                      onChange={(e) => updateColor(e.target.value)}
                      className="h-7 w-8 rounded border border-input cursor-pointer bg-transparent p-0.5"
                    />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <label className="text-xs text-muted-foreground">
                      {selectedEl.shape === "circle" ? "Size" : "W"}
                    </label>
                    <Input
                      type="number"
                      min={1}
                      value={Math.round(selectedEl.w)}
                      onChange={(e) => updateSize("w", parseInt(e.target.value) || 0)}
                      className="h-7 text-xs w-16"
                    />
                  </div>
                  {selectedEl.shape !== "circle" && (
                    <div className="flex items-center gap-2 shrink-0">
                      <label className="text-xs text-muted-foreground">H</label>
                      <Input
                        type="number"
                        min={1}
                        value={Math.round(selectedEl.h)}
                        onChange={(e) => updateSize("h", parseInt(e.target.value) || 0)}
                        className="h-7 text-xs w-16"
                      />
                    </div>
                  )}

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
                            elements: prev.elements.map((el) => (el.id === selectedId ? { ...el, seats } : el)),
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
                  Click an element to select it, then edit its label, color, and size. Press Save Layout when done.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
