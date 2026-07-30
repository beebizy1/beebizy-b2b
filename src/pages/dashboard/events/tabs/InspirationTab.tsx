import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useListEventInspirations,
  useAddEventInspiration,
  useDeleteEventInspiration,
  getListEventInspirationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Image as ImageIcon, ExternalLink } from "lucide-react";
import { QueryError } from "@/components/QueryError";

interface Props {
  eventId: string;
}

const SAMPLE_IMAGES = [
  { url: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600&q=80", caption: "Conference setup" },
  { url: "https://images.unsplash.com/photo-1511578314322-379afb476865?w=600&q=80", caption: "Stage lighting" },
  { url: "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=600&q=80", caption: "Panel discussion" },
  { url: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=600&q=80", caption: "Crowd energy" },
  { url: "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=600&q=80", caption: "Evening gala" },
  { url: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=600&q=80", caption: "Team tables" },
];

function AddImageDialog({ eventId, onAdded }: { eventId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [preview, setPreview] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const { toast } = useToast();
  const add = useAddEventInspiration();

  const handleUrlChange = (val: string) => {
    setUrl(val);
    setPreview(false);
    setPreviewError(false);
  };

  const handleAdd = () => {
    if (!url.trim()) return;
    add.mutate(
      { id: eventId, data: { url: url.trim(), caption: caption.trim() || undefined } },
      {
        onSuccess: () => {
          toast({ title: "Image added to board" });
          setOpen(false);
          setUrl("");
          setCaption("");
          setPreview(false);
          onAdded();
        },
        onError: () => {
          toast({ title: "Failed to add image", variant: "destructive" });
        },
      }
    );
  };

  const handleAddSample = (sample: { url: string; caption: string }) => {
    add.mutate(
      { id: eventId, data: { url: sample.url, caption: sample.caption } },
      {
        onSuccess: () => {
          toast({ title: "Image added to board" });
          onAdded();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Add Image
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add to Inspiration Board</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="img-url">Image URL</Label>
            <div className="flex gap-2">
              <Input
                id="img-url"
                placeholder="https://example.com/image.jpg"
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setPreview(true)}
              />
              <Button variant="outline" size="sm" onClick={() => { setPreview(true); setPreviewError(false); }} disabled={!url.trim()}>
                Preview
              </Button>
            </div>
          </div>
          {preview && url && (
            <div className="rounded-lg overflow-hidden border bg-muted aspect-video flex items-center justify-center">
              {previewError ? (
                <div className="text-muted-foreground text-sm text-center p-4">
                  <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  Could not load image. Check the URL.
                </div>
              ) : (
                <img
                  src={url}
                  alt="preview"
                  className="object-contain max-h-48 w-full"
                  onError={() => setPreviewError(true)}
                />
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="img-caption">Caption (optional)</Label>
            <Input
              id="img-caption"
              placeholder="e.g. Venue inspiration, Lighting mood..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Or pick a sample</p>
            <div className="grid grid-cols-3 gap-2">
              {SAMPLE_IMAGES.map((s) => (
                <button
                  key={s.url}
                  onClick={() => handleAddSample(s)}
                  className="rounded-md overflow-hidden border hover:ring-2 ring-primary transition-all aspect-video bg-muted"
                >
                  <img src={s.url} alt={s.caption} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleAdd} disabled={!url.trim() || add.isPending}>
            {add.isPending ? "Adding..." : "Add to Board"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InspirationCard({
  item,
  onDelete,
}: {
  item: { id: string; url: string; caption?: string | null };
  onDelete: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className="relative rounded-xl overflow-hidden bg-muted group cursor-pointer break-inside-avoid mb-3"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {imgError ? (
        <div className="w-full h-36 flex flex-col items-center justify-center text-muted-foreground text-xs gap-2 bg-muted">
          <ImageIcon className="w-6 h-6 opacity-40" />
          <span className="px-3 text-center break-all">{item.url}</span>
        </div>
      ) : (
        <img
          src={item.url}
          alt={item.caption || "Inspiration"}
          className="w-full h-auto object-cover"
          onError={() => setImgError(true)}
        />
      )}

      {/* Hover overlay */}
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 flex flex-col justify-between p-3 ${
          hovered ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex justify-end gap-2">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
            className="p-1.5 rounded-lg bg-white/20 hover:bg-red-500/80 text-white transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        {item.caption && (
          <div className="text-white text-sm font-medium leading-snug">{item.caption}</div>
        )}
      </div>
    </div>
  );
}

export function InspirationTab({ eventId }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: images = [], isLoading, isError, error } = useListEventInspirations(eventId, {
    query: { enabled: !!eventId, queryKey: getListEventInspirationsQueryKey(eventId) },
  });
  const deleteImage = useDeleteEventInspiration();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getListEventInspirationsQueryKey(eventId) });
  };

  const handleDelete = (itemId: string) => {
    deleteImage.mutate(
      { id: eventId, itemId },
      {
        onSuccess: () => {
          toast({ title: "Image removed" });
          refresh();
        },
        onError: () => {
          toast({ title: "Failed to remove image", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Inspiration Board</h2>
          <p className="text-sm text-muted-foreground">
            Collect visual references, mood boards, and design inspiration for your event.
          </p>
        </div>
        <AddImageDialog eventId={eventId} onAdded={refresh} />
      </div>

      {isError ? (
        <QueryError error={error} label="Failed to load inspiration board." />
      ) : isLoading ? (
        <div className="columns-2 md:columns-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="rounded-xl bg-muted animate-pulse break-inside-avoid mb-3"
              style={{ height: `${120 + (i % 3) * 60}px` }}
            />
          ))}
        </div>
      ) : images.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-muted/30 p-16 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <ImageIcon className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">No images yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Add image URLs to build a visual mood board — venue photos, decor references, color palettes, and more.
            </p>
          </div>
          <AddImageDialog eventId={eventId} onAdded={refresh} />
        </div>
      ) : (
        <div className="columns-2 md:columns-3 gap-3">
          {images.map((item) => (
            <InspirationCard key={item.id} item={item} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
