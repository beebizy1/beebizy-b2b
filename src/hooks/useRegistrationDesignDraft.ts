import { useEffect, useMemo, useState } from "react";
import { useData, useDataMode } from "@/data/provider";
import type { Event } from "@/data/entities";
import { RegistrationDesignRecovery } from "@/data/registrationDesignRecovery";

export function useRegistrationDesignDraft(event: Event) {
  const adapter = useData();
  const { mode } = useDataMode();
  const recovery = useMemo(() => new RegistrationDesignRecovery(adapter.registrationDesignDrafts, event.id,
    `beebizy:invitation-design:${adapter.cacheScope}:${event.id}`,
    { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) }, mode === "demo", event.registrationPage),
  // The editor owns its in-progress document; query refreshes must not reset it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [adapter, event.id, mode]);
  const [state, setState] = useState(recovery.state);
  useEffect(() => { void recovery.start(setState); return () => recovery.stop(); }, [recovery]);
  return { state, recovery, draft: state.page, guestTypesInput: state.guestTypesInput,
    setDraft: recovery.setPage.bind(recovery), setGuestTypesInput: recovery.setGuestTypes.bind(recovery) };
}
