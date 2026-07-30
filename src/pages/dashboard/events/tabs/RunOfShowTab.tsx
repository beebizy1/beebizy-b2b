import { useState } from "react";
import {
  useListRunOfShow,
  useCreateRunOfShowItem,
  useUpdateRunOfShowItem,
  useDeleteRunOfShowItem,
  getListRunOfShowQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Clock, Edit2, Check, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { QueryError } from "@/components/QueryError";

interface Props { eventId: string }

type Item = {
  id: string;
  startTime: string;
  duration: number | null;
  title: string;
  description: string | null;
  responsible: string | null;
  sortOrder: number;
};

function EditRow({ item, eventId, onDone }: { item: Item; eventId: string; onDone: () => void }) {
  const [startTime, setStartTime] = useState(item.startTime);
  const [duration, setDuration] = useState(item.duration?.toString() ?? "");
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [responsible, setResponsible] = useState(item.responsible ?? "");
  const update = useUpdateRunOfShowItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const save = () => {
    update.mutate(
      {
        id: eventId,
        itemId: item.id,
        data: { startTime, duration: duration ? parseInt(duration) : undefined, title, description: description || undefined, responsible: responsible || undefined },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRunOfShowQueryKey(eventId) });
          onDone();
        },
        onError: () => toast({ title: "Failed to update", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Time *</label>
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Duration (min)</label>
          <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="30" className="text-sm" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-muted-foreground mb-1 block">Title *</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Segment title" className="text-sm" />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Description</label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="text-sm resize-none" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Responsible</label>
          <Input value={responsible} onChange={(e) => setResponsible(e.target.value)} placeholder="Person or team" className="text-sm" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={!title || !startTime || update.isPending} className="gap-1">
          <Check className="w-3.5 h-3.5" /> Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}><X className="w-3.5 h-3.5" /></Button>
      </div>
    </div>
  );
}

function AddRow({ eventId, nextOrder }: { eventId: string; nextOrder: number }) {
  const [open, setOpen] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [duration, setDuration] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [responsible, setResponsible] = useState("");
  const create = useCreateRunOfShowItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const save = () => {
    create.mutate(
      {
        id: eventId,
        data: { startTime, duration: duration ? parseInt(duration) : undefined, title, description: description || undefined, responsible: responsible || undefined, sortOrder: nextOrder },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRunOfShowQueryKey(eventId) });
          setTitle(""); setDescription(""); setResponsible(""); setDuration(""); setOpen(false);
        },
        onError: () => toast({ title: "Failed to add item", variant: "destructive" }),
      }
    );
  };

  if (!open) return (
    <Button variant="outline" size="sm" className="gap-1.5 w-full mt-2" onClick={() => setOpen(true)}>
      <Plus className="w-3.5 h-3.5" /> Add segment
    </Button>
  );

  return (
    <div className="bg-muted/30 border border-dashed border-border rounded-xl p-4 space-y-3 mt-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Time *</label>
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Duration (min)</label>
          <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="30" className="text-sm" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-muted-foreground mb-1 block">Title *</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Segment title" className="text-sm" />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Description</label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="text-sm resize-none" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Responsible</label>
          <Input value={responsible} onChange={(e) => setResponsible(e.target.value)} placeholder="Person or team" className="text-sm" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={!title || !startTime || create.isPending} className="gap-1">
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}><X className="w-3.5 h-3.5" /></Button>
      </div>
    </div>
  );
}

export function RunOfShowTab({ eventId }: Props) {
  const { data: items = [], isLoading, isError, error } = useListRunOfShow(eventId);
  const deleteItem = useDeleteRunOfShowItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleDelete = (itemId: string) => {
    deleteItem.mutate(
      { id: eventId, itemId },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListRunOfShowQueryKey(eventId) }),
        onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
      }
    );
  };

  if (isError) return <QueryError error={error} label="Failed to load run of show." />;
  if (isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-base">Run of Show</h3>
        <span className="text-xs text-muted-foreground">{items.length} segments</span>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border rounded-xl text-muted-foreground">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">No segments yet.</p>
          <p className="text-xs mt-1">Build your event timeline segment by segment.</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-[4.5rem] top-0 bottom-0 w-px bg-border" />
          <div className="space-y-2">
            {items.map((item) =>
              editingId === item.id ? (
                <EditRow key={item.id} item={item as Item} eventId={eventId} onDone={() => setEditingId(null)} />
              ) : (
                <div key={item.id} className="flex items-start gap-4 group">
                  <div className="w-16 text-right shrink-0 pt-3">
                    <span className="text-sm font-bold text-foreground tabular-nums">{item.startTime}</span>
                  </div>
                  <div className="w-4 h-4 rounded-full bg-primary/20 border-2 border-primary shrink-0 mt-3.5 relative z-10" />
                  <div className="flex-1 bg-card border border-border rounded-xl p-3 hover:border-primary/30 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-semibold text-sm text-foreground">{item.title}</span>
                        {item.duration && (
                          <span className="ml-2 text-xs text-muted-foreground">({item.duration} min)</span>
                        )}
                        {item.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                        )}
                        {item.responsible && (
                          <p className="text-xs text-primary mt-1">Responsible: {item.responsible}</p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(item.id)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}

      <AddRow eventId={eventId} nextOrder={items.length} />
    </div>
  );
}
