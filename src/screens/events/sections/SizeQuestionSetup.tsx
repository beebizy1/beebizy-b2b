import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useData } from "@/data/provider";
import { APPAREL_PRESETS, planSizeQuestion, type EventOperationsSnapshot, type SizeQuestionSetup as SetupResult } from "@/data/eventOperations";
import type { RegistrationPageSettings } from "@/data/registrationPage";

export default function SizeQuestionSetup({ eventId, page, snapshot, dirty, onAdded, onMessage, onBusyChange }: { eventId: string; page: RegistrationPageSettings; snapshot: EventOperationsSnapshot; dirty: boolean; onAdded(result: SetupResult): void; onMessage(message: string): void; onBusyChange(busy: boolean): void }) {
  const adapter = useData(); const [busy, setBusy] = useState<string | null>(null);
  async function add(kind: keyof typeof APPAREL_PRESETS) {
    setBusy(kind); onBusyChange(true);
    try { onAdded(await adapter.eventOperations.addSizeQuestion(eventId, kind, snapshot.revision)); onMessage(`${APPAREL_PRESETS[kind].label} is now on your guest form and packing list.`); }
    catch (error) { onMessage(error instanceof Error ? error.message : "The size question could not be added. Please try again."); }
    finally { setBusy(null); onBusyChange(false); }
  }
  return <section className="space-y-3 rounded-xl border border-primary/30 bg-primary/10 p-4" aria-label="Add size questions">
    <h3 className="font-bold">What sizes do you need?</h3><p className="text-sm leading-6 text-muted-foreground">Choose a question below. It is added to your live guest form and packing list together. New questions are optional for guests.</p>
    <div className="flex flex-wrap gap-2">{(Object.keys(APPAREL_PRESETS) as Array<keyof typeof APPAREL_PRESETS>).map(kind => {
      let selected = false; let limit = false;
      try { const planned = planSizeQuestion(eventId, kind, page, snapshot.document); selected = planned.questions.length === page.questions.length && planned.document.apparel.questionIds.length === snapshot.document.apparel.questionIds.length; } catch { limit = true; }
      return <Button key={kind} type="button" variant="outline" disabled={!!busy || dirty || selected || limit} onClick={() => void add(kind)}>{selected ? <Check className="size-4" /> : <Plus className="size-4" />}{busy === kind ? "Adding…" : selected ? `${APPAREL_PRESETS[kind].label} added` : `Add ${APPAREL_PRESETS[kind].label.toLowerCase()} to form`}</Button>;
    })}</div>
    {dirty ? <p className="text-xs text-muted-foreground">Save your other changes first, then add a new question.</p> : null}
    {page.questions.length >= 12 ? <p className="text-xs text-muted-foreground">Your form has 12 questions. You can change them in More form settings below.</p> : null}
  </section>;
}
