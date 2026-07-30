import { useState } from "react";
import { useShareEvent } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Share2, Copy, Check, Clock, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  eventId: string;
  eventTitle: string;
}

export function ShareEventDialog({ eventId, eventTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const shareMutation = useShareEvent();

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && !shareUrl) {
      shareMutation.mutate(
        { id: eventId },
        {
          onSuccess: (data) => {
            const base = import.meta.env.BASE_URL.replace(/\/$/, "");
            setShareUrl(`${window.location.origin}${base}/share/${data.shareToken}`);
          },
          onError: () => {
            toast({ title: "Failed to generate link", variant: "destructive" });
          },
        }
      );
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast({ title: "Link copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Share2 className="w-4 h-4" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share with your team</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Anyone with this link can view a read-only snapshot of <strong>{eventTitle}</strong>.
          </p>

          <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">What's included</p>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-3.5 h-3.5 text-primary" />
              Run of Show
            </div>
            <div className="flex items-center gap-2 text-sm">
              <ClipboardList className="w-3.5 h-3.5 text-primary" />
              Checklist with completion status
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Shareable link</p>
            {shareMutation.isPending || !shareUrl ? (
              <div className="h-9 bg-muted animate-pulse rounded-md" />
            ) : (
              <div className="flex gap-2">
                <Input value={shareUrl} readOnly className="text-xs font-mono" />
                <Button variant="outline" size="icon" onClick={handleCopy}>
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              The same link is reused each time — share it with your whole team.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
