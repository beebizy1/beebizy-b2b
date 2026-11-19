import { useEffect, useMemo, useState } from "react";
import { useData, useDataMode } from "@/data/provider";
import { RegistrationGuestDraftRecovery } from "@/data/registrationGuestDraft";

export function useRegistrationGuestDraft(eventId: string, key: string, initial: Record<string, string>) {
  const adapter = useData();
  const { mode } = useDataMode();
  const recovery = useMemo(() => new RegistrationGuestDraftRecovery(adapter.registrationGuestDrafts, eventId, key,
    `beebizy:guest-editor:${adapter.cacheScope}:${eventId}:${key}`,
    { getItem: name => localStorage.getItem(name), setItem: (name, value) => localStorage.setItem(name, value) }, mode === "demo", initial),
  // Refetching a registration must not replace the organizer's unfinished edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [adapter, eventId, key, mode]);
  const [state, setState] = useState(recovery.state);
  useEffect(() => { void recovery.start(setState); return () => recovery.stop(); }, [recovery]);
  return { state, recovery, draft: state.values, setDraft: recovery.setValues.bind(recovery) };
}
