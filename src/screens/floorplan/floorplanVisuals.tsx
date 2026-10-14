import type { FloorplanItem, FloorplanRoom } from "@/data/entities";
import { DEFAULT_CUSTOM_OBJECT_POINTS, roomClipPath, smoothClosedPath } from "@/data/floorplanGeometry";
import { cn } from "@/lib/utils";

export function FloorplanRoomBackdrop({ room }: { room: FloorplanRoom }) {
  return (
    <>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-surface-sunken shadow-inner"
        style={{
          clipPath: roomClipPath(room),
          backgroundImage:
            "linear-gradient(to right, hsl(var(--hairline)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--hairline)) 1px, transparent 1px)",
          backgroundSize: "5% 8.333%",
        }}
      />
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full text-primary/70" viewBox="0 0 100 100" preserveAspectRatio="none">
        {room.shape === "oval" ? (
          <ellipse cx="50" cy="50" rx="48" ry="48" fill="none" stroke="currentColor" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
        ) : (
          <polygon points={room.points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
    </>
  );
}

export function FloorplanItemVisual({ item, showLabel = true }: { item: FloorplanItem; showLabel?: boolean }) {
  if (item.shape === "image" && item.imageUrl) {
    return <img src={item.imageUrl} alt={item.label} draggable={false} className="pointer-events-none absolute inset-0 size-full select-none rounded-[inherit] object-contain" />;
  }

  if (item.shape === "custom-shape") {
    const points = item.points ?? DEFAULT_CUSTOM_OBJECT_POINTS;
    return (
      <>
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
          {item.customShapeMode === "polygon" || !item.customShapeMode ? (
            <polygon points={points.map((point) => `${point.x},${point.y}`).join(" ")} className="fill-info-tint stroke-info/60" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          ) : (
            <path d={smoothClosedPath(points)} className="fill-info-tint stroke-info/60" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {showLabel ? <span className="relative z-10 px-2">{item.label}</span> : null}
      </>
    );
  }

  return showLabel ? <span className={cn("px-1", item.shape === "text" && "whitespace-pre-wrap leading-tight")}>{item.label}</span> : null;
}
