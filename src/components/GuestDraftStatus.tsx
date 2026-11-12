import { Button } from "@/components/ui/button";
import type { GuestDraftState, RegistrationGuestDraftRecovery } from "@/data/registrationGuestDraft";

export function GuestDraftStatus({ state, recovery }: { state: GuestDraftState; recovery: RegistrationGuestDraftRecovery }) {
  return <div className="space-y-2 text-xs text-muted-foreground" role="status">
    {state.message ? <p>{state.message}</p> : null}
    {state.remote ? <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => recovery.resolve(true)}>Use saved draft</Button><Button type="button" size="sm" variant="outline" onClick={() => recovery.resolve(false)}>Keep this device's changes</Button></div> : null}
    {state.message.includes("failed") && !state.remote ? <Button type="button" size="sm" variant="outline" onClick={() => void recovery.flush()}>Retry saving draft</Button> : null}
  </div>;
}
