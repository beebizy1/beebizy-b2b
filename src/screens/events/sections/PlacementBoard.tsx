import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { useState } from "react";
import { createPortal } from "react-dom";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RegistrationWithGuest } from "@/data/entities";
import { placeRegistration, type EventOperationsDocument, type PlacementGroup } from "@/data/eventOperations";

function Person({ row, groups, used, groupId, move }: { row: RegistrationWithGuest; groups: PlacementGroup[]; used: Map<string, number>; groupId: string; move(id: string, group: string): void }) {
  const disabled = row.quantity > 1 || !groups.length;
  const drag = useDraggable({ id: row.id, disabled });
  return <li ref={drag.setNodeRef} className="relative flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-white p-3" style={{ opacity: drag.isDragging ? .75 : 1, zIndex: drag.isDragging ? 20 : undefined, transform: drag.transform ? `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)` : undefined }}>
    <button type="button" {...drag.listeners} {...drag.attributes} disabled={disabled} aria-label={`Drag ${row.guest?.name ?? "guest"}`} className="touch-none rounded p-1 hover:bg-muted disabled:opacity-30"><GripVertical className="size-4" /></button>
    <span className="min-w-0 flex-1 break-words text-sm font-medium">{row.guest?.name ?? "Guest"}{row.status === "cancelled" ? " (cancelled: move back to waiting to free this place)" : ""}{row.quantity > 1 ? ` (${row.quantity} people: add each guest by name before placing them)` : ""}</span>
    <select aria-label={`Move ${row.guest?.name ?? "guest"}`} className="max-w-full rounded border border-input bg-background p-2 text-xs" value={groupId} onChange={e => move(row.id, e.target.value)}><option value="">Waiting to be placed</option>{groups.map(group => { const full = (used.get(group.id) ?? 0) >= group.capacity; return <option key={group.id} disabled={row.quantity > 1 || (full && groupId !== group.id)} value={group.id}>{group.name}{full && groupId !== group.id ? " (full)" : ""}</option>; })}</select>
  </li>;
}
function Zone({ group, children }: { group: PlacementGroup | null; children: React.ReactNode }) {
  const drop = useDroppable({ id: group?.id ?? "unassigned" });
  return <section ref={drop.setNodeRef} aria-label={group?.name ?? "Guests waiting to be placed"} className={`min-h-36 rounded-xl border p-4 ${drop.isOver ? "border-primary bg-primary/15" : "border-hairline bg-muted/20"}`}>{children}</section>;
}
export default function PlacementBoard({ document, rows, kind, onChange, onError }: { document: EventOperationsDocument; rows: RegistrationWithGuest[]; kind: PlacementGroup["kind"]; onChange(document: EventOperationsDocument): void; onError(message: string): void }) {
  const [search, setSearch] = useState(""); const [dragging, setDragging] = useState<string | null>(null); const [editing, setEditing] = useState<string | null>(null); const [removing, setRemoving] = useState<string | null>(null);
  const groups = document.groups.filter(group => group.kind === kind);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const placement = new Map(document.assignments.filter(item => groups.some(group => group.id === item.groupId)).map(item => [item.registrationId, item.groupId]));
  const used = new Map(groups.map(group => [group.id, document.assignments.filter(item => item.groupId === group.id).length]));
  const people = [...new Map(rows.filter(row => row.status !== "cancelled" || placement.has(row.id)).map(row => [row.id, row])).values()];
  const move = (id: string, group: string) => { try { onChange(placeRegistration(document, id, group || null, kind)); } catch (error) { onError(error instanceof Error ? error.message : "This group is full. Choose another one."); } };
  const end = ({ active, over }: DragEndEvent) => { setDragging(null); if (over) move(String(active.id), over.id === "unassigned" ? "" : String(over.id)); };
  const patch = (id: string, value: Partial<PlacementGroup>) => onChange({ ...document, groups: document.groups.map(group => group.id === id ? { ...group, ...value } : group) });
  const groupName = kind === "golf" ? "golf group" : "table";
  return <div className="space-y-4">
    <div className="rounded-xl bg-primary/10 p-4"><h3 className="font-bold">{groups.length ? `Drag a guest into a ${groupName}` : `First, add a ${groupName}`}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{kind === "golf" ? "A golf group holds up to four people. " : "Choose how many seats each table has. "}Drag a name using its handle, or use the menu beside the name. Choose Save changes when you are ready.</p></div>
    <Button type="button" onClick={() => onChange({ ...document, groups: [...document.groups, { id: crypto.randomUUID(), kind, name: `${kind === "golf" ? "Golf group" : "Table"} ${groups.length + 1}`, capacity: kind === "golf" ? 4 : 10, location: "", time: "", floorplanItemId: null }] })}>Add {groupName}</Button>
    <Input aria-label="Find a guest to place" placeholder="Find a guest by name…" value={search} onChange={e => setSearch(e.target.value)} />
    {!people.length ? <p className="rounded-lg border border-dashed border-hairline p-4 text-sm text-muted-foreground">Guests will appear here after they register or you add them to the guest list.</p> : null}
    <DndContext sensors={sensors} onDragStart={({ active }) => setDragging(String(active.id))} onDragCancel={() => setDragging(null)} onDragEnd={end}><div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[null, ...groups].map(group => {
        const occupants = people.filter(row => (placement.get(row.id) ?? "") === (group?.id ?? ""));
        const visible = occupants.filter(row => (row.guest?.name ?? "").toLowerCase().includes(search.trim().toLowerCase()));
        return <Zone key={group?.id ?? "unassigned"} group={group}>
          {group ? <div className="mb-4 space-y-3"><div className="flex items-start justify-between gap-3"><div><h3 className="break-words font-bold">{group.name || `Your ${groupName}`}</h3><p className="mt-1 text-xs text-muted-foreground">{occupants.length} of {group.capacity} places filled{group.location ? ` · ${group.location}` : ""}{group.time ? ` · ${group.time}` : ""}</p></div><Button size="sm" variant="outline" aria-expanded={editing === group.id} onClick={() => { setEditing(editing === group.id ? null : group.id); setRemoving(null); }}>{editing === group.id ? "Done editing" : "Edit"}</Button></div>
            {editing === group.id ? <div className="space-y-3 rounded-lg border border-hairline bg-white p-3"><label className="block space-y-1 text-xs font-medium">Name<Input aria-label={`Name of ${group.name}`} value={group.name} maxLength={100} onChange={e => patch(group.id, { name: e.target.value })} /></label><label className="block space-y-1 text-xs font-medium">{kind === "golf" ? "Number of golfers (up to 4)" : "Number of seats"}<Input aria-label={`Places in ${group.name}`} type="number" min={Math.max(1, occupants.length)} max={kind === "golf" ? 4 : 100} value={group.capacity} onChange={e => patch(group.id, { capacity: Number(e.target.value) })} /></label><label className="block space-y-1 text-xs font-medium">{kind === "golf" ? "Starting hole" : "Where is the table?"}<Input aria-label={`Location of ${group.name}`} maxLength={200} value={group.location} onChange={e => patch(group.id, { location: e.target.value })} /></label><label className="block space-y-1 text-xs font-medium">{kind === "golf" ? "Tee time" : "Notes"}<Input aria-label={`Notes for ${group.name}`} maxLength={80} value={group.time} onChange={e => patch(group.id, { time: e.target.value })} /></label>{removing === group.id ? <div className="space-y-2 rounded-lg bg-muted/30 p-3 text-xs"><p>Remove {group.name}? Its guests will move back to the waiting list.</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setRemoving(null)}>Keep it</Button><Button size="sm" variant="outline" onClick={() => { onChange({ ...document, groups: document.groups.filter(item => item.id !== group.id), assignments: document.assignments.filter(item => item.groupId !== group.id) }); setRemoving(null); setEditing(null); }}>Remove {groupName}</Button></div></div> : <Button size="sm" variant="ghost" onClick={() => setRemoving(group.id)}>Remove this {groupName}</Button>}</div> : null}
          </div> : <h3 className="mb-4 font-bold">Waiting to be placed ({occupants.length})</h3>}
          <ul className="max-h-[28rem] space-y-2 overflow-y-auto">{visible.map(row => <Person key={row.id} row={row} groups={groups} used={used} groupId={placement.get(row.id) ?? ""} move={move} />)}</ul>
          {!visible.length ? <p className="p-3 text-xs text-muted-foreground">{search ? "No matching guests here." : !people.length ? "Your guests will appear here." : group ? "Drop a guest here" : "Everyone has a place in this view."}</p> : null}
        </Zone>;
      })}
    </div>{createPortal(<DragOverlay>{dragging ? <div className="rounded-lg border border-primary bg-white p-3 text-sm font-semibold shadow-lg">{people.find(row => row.id === dragging)?.guest?.name ?? "Guest"}</div> : null}</DragOverlay>, window.document.body)}</DndContext>
  </div>;
}
