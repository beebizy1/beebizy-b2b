import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { useState } from "react";
import { createPortal } from "react-dom";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RegistrationWithGuest } from "@/data/entities";
import { placeRegistration, type EventOperationsDocument, type PlacementGroup } from "@/data/eventOperations";

function Person({ row, groups, groupId, move }: { row: RegistrationWithGuest; groups: PlacementGroup[]; groupId: string; move(id: string, group: string): void }) {
  const drag = useDraggable({ id: row.id, disabled: row.quantity > 1 });
  return <li ref={drag.setNodeRef} className="relative flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-white p-3" style={{ opacity: drag.isDragging ? .75 : 1, zIndex: drag.isDragging ? 20 : undefined, transform: drag.transform ? `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)` : undefined }}>
    <button type="button" {...drag.listeners} {...drag.attributes} aria-label={`Drag ${row.guest?.name ?? "guest"}`} className="touch-none rounded p-1 hover:bg-muted"><GripVertical className="size-4" /></button>
    <span className="min-w-0 flex-1 break-words text-sm font-medium">{row.guest?.name ?? "Guest"}{row.status === "cancelled" ? " (cancelled, unassign to free this seat)" : ""}{row.quantity > 1 ? ` (${row.quantity} people: add individual guest records before placing)` : ""}</span>
    <select aria-label={`Placement for ${row.guest?.name ?? "guest"}`} className="max-w-full rounded border border-input bg-background p-1 text-xs" value={groupId} onChange={e => move(row.id, e.target.value)}><option value="">Unassigned</option>{groups.map(group => <option key={group.id} disabled={row.quantity > 1} value={group.id}>{group.name}</option>)}</select>
  </li>;
}

function Zone({ group, children }: { group: PlacementGroup | null; children: React.ReactNode }) {
  const drop = useDroppable({ id: group?.id ?? "unassigned" });
  return <section ref={drop.setNodeRef} aria-label={group?.name ?? "Unassigned guests"} className={`min-h-36 rounded-xl border p-3 ${drop.isOver ? "border-primary bg-primary/15" : "border-hairline bg-muted/20"}`}>{children}</section>;
}

export default function PlacementBoard({ document, rows, kind, onChange, onError }: { document: EventOperationsDocument; rows: RegistrationWithGuest[]; kind: PlacementGroup["kind"]; onChange(document: EventOperationsDocument): void; onError(message: string): void }) {
  const [search, setSearch] = useState(""); const [dragging, setDragging] = useState<string | null>(null);
  const groups = document.groups.filter(group => group.kind === kind);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const placement = new Map(document.assignments.filter(item => groups.some(group => group.id === item.groupId)).map(item => [item.registrationId, item.groupId]));
  const people = [...new Map(rows.filter(row => row.status !== "cancelled" || placement.has(row.id)).map(row => [row.id, row])).values()];
  const move = (id: string, group: string) => { try { onChange(placeRegistration(document, id, group || null, kind)); } catch (error) { onError(error instanceof Error ? error.message : "That group is full."); } };
  const end = ({ active, over }: DragEndEvent) => { setDragging(null); if (over) move(String(active.id), over.id === "unassigned" ? "" : String(over.id)); };
  const patch = (id: string, value: Partial<PlacementGroup>) => onChange({ ...document, groups: document.groups.map(group => group.id === id ? { ...group, ...value } : group) });
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Drag a person into a {kind === "golf" ? "foursome" : "table"}, or use their placement menu. Each person can have one table and one foursome. Save changes to share the arrangement with your team.</p>
    <Button type="button" onClick={() => onChange({ ...document, groups: [...document.groups, { id: crypto.randomUUID(), kind, name: `${kind === "golf" ? "Foursome" : "Table"} ${groups.length + 1}`, capacity: kind === "golf" ? 4 : 10, location: "", time: "", floorplanItemId: null }] })}>Add {kind === "golf" ? "foursome" : "table"}</Button>
    <Input aria-label="Find a guest to place" placeholder="Find a guest by name…" value={search} onChange={e => setSearch(e.target.value)} />
    <DndContext sensors={sensors} onDragStart={({ active }) => setDragging(String(active.id))} onDragCancel={() => setDragging(null)} onDragEnd={end}><div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[null, ...groups].map(group => {
        const occupants = people.filter(row => (placement.get(row.id) ?? "") === (group?.id ?? ""));
        return <Zone key={group?.id ?? "unassigned"} group={group}>
          {group ? <div className="mb-3 space-y-2">
            <Input aria-label={`Name of ${group.name}`} value={group.name} maxLength={100} onChange={e => patch(group.id, { name: e.target.value })} />
            <label className="flex items-center justify-between gap-2 text-xs">Capacity ({occupants.length} assigned)<Input aria-label={`Capacity of ${group.name}`} className="w-20" type="number" min={Math.max(1, occupants.length)} max={kind === "golf" ? 4 : 100} value={group.capacity} onChange={e => patch(group.id, { capacity: Number(e.target.value) })} /></label>
            <Input aria-label={`Location of ${group.name}`} placeholder={kind === "golf" ? "Starting hole" : "Location / floorplan table label"} value={group.location} onChange={e => patch(group.id, { location: e.target.value })} />
            <Input aria-label={`Time for ${group.name}`} placeholder={kind === "golf" ? "Tee time, e.g. 8:30 AM" : "Seating notes"} value={group.time} onChange={e => patch(group.id, { time: e.target.value })} />
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ ...document, groups: document.groups.filter(item => item.id !== group.id), assignments: document.assignments.filter(item => item.groupId !== group.id) })}>Remove group and unassign guests</Button>
          </div> : <h3 className="mb-3 font-semibold">Unassigned ({occupants.length})</h3>}
          <ul className="max-h-[28rem] space-y-2 overflow-y-auto">{occupants.filter(row => (row.guest?.name ?? "").toLowerCase().includes(search.trim().toLowerCase())).map(row => <Person key={row.id} row={row} groups={groups} groupId={placement.get(row.id) ?? ""} move={move} />)}</ul>
          {!occupants.length ? <p className="p-3 text-xs text-muted-foreground">Drop a guest here</p> : null}
        </Zone>;
      })}
    </div>{createPortal(<DragOverlay>{dragging ? <div className="rounded-lg border border-primary bg-white p-3 text-sm font-semibold shadow-lg">{people.find(row => row.id === dragging)?.guest?.name ?? "Guest"}</div> : null}</DragOverlay>, window.document.body)}</DndContext>
  </div>;
}
