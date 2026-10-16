import { Copy, LayoutGrid, Printer } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingRows, Panel } from "@/components/primitives";
import { usePublicFloorplan } from "@/data/hooks";
import type { Floorplan } from "@/data/entities";
import {
  DEFAULT_FLOORPLAN_ROOM,
} from "@/data/floorplanGeometry";
import { FloorplanItemVisual, FloorplanRoomBackdrop } from "@/screens/floorplan/floorplanVisuals";
import { FLOORPLAN_SHAPE_SPECS } from "@/screens/floorplan/floorplanShapeSpecs";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

function FloorplanPreviewCanvas({ plan }: { plan: Floorplan }) {
  const room = plan.room ?? DEFAULT_FLOORPLAN_ROOM;
  const visualAspectRatio = Math.max(0.65, Math.min(2.4, room.widthFeet / room.lengthFeet));

  return (
    <div
      aria-label={`${plan.name} floorplan`}
      className="relative min-h-[360px] w-full overflow-hidden rounded-xl border border-hairline bg-muted/30 print:min-h-0 print:rounded-none"
      style={{ aspectRatio: visualAspectRatio }}
    >
      <FloorplanRoomBackdrop room={room} />

      {plan.items.map((item) => {
        const spec = FLOORPLAN_SHAPE_SPECS[item.shape];
        const width = item.width ?? spec.width;
        const height = item.height ?? spec.height;
        return (
          <div
            key={item.id}
            className={cn(
              "absolute flex select-none items-center justify-center border text-center text-[10px] font-semibold leading-tight shadow-xs",
              spec.round ? "rounded-full" : "rounded-md",
              spec.className,
              item.shape === "text" && "text-sm font-bold sm:text-base",
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
            <FloorplanItemVisual item={item} />
          </div>
        );
      })}
    </div>
  );
}

export default function PublicFloorplan({ token }: { token: string }) {
  const { data: shared, isLoading } = usePublicFloorplan(token);
  const selected = shared?.floorplan ?? null;

  if (isLoading) return <main className="mx-auto max-w-6xl p-8"><LoadingRows rows={6} /></main>;
  if (!shared || !selected) {
    return (
      <main className="mx-auto max-w-4xl p-8">
        <Panel><EmptyState icon={LayoutGrid} title="This floorplan is not available" description="Ask the organizer for the current floorplan link." /></Panel>
      </main>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-hairline bg-surface print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5"><BrandLogo size="sm" /><span className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Shared floorplan</span></div>
      </header>
      <main className="mx-auto max-w-6xl space-y-5 px-6 py-8 print:max-w-none print:p-0">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{shared.eventTitle}</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">{selected.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Read-only floorplan shared by the event organizer.</p>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" onClick={() => void navigator.clipboard.writeText(window.location.href).then(() => toast({ title: "Floorplan link copied" }))}><Copy className="mr-1.5 size-4" />Copy link</Button>
            <Button onClick={() => window.print()}><Printer className="mr-1.5 size-4" />Print / Save PDF</Button>
          </div>
        </div>

        <Panel className="overflow-hidden p-4 print:border-0 print:p-0 print:shadow-none">
          <FloorplanPreviewCanvas plan={selected} />
        </Panel>
        <p className="text-xs text-muted-foreground print:hidden">Anyone with this link can view only this floorplan without signing in. Editing and other event details remain private inside Beebizy.</p>
      </main>
    </div>
  );
}
