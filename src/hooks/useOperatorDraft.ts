import { useEffect, useMemo, useState } from "react";
import { useData } from "@/data/provider";
import { RegistrationGuestDraftRecovery } from "@/data/registrationGuestDraft";

/** Shares the complete document recovery contract; only an explicit Save publishes it. */
export function useOperatorDraft(key: string, initial: Record<string,string>) {
  const adapter = useData();
  const recovery = useMemo(() => new RegistrationGuestDraftRecovery({
    get: () => adapter.admin.getDraft(key),
    save: (_workspace, _key, draft) => adapter.admin.saveDraft(key,draft),
  }, "internal", key, `beebizy:operator:${adapter.cacheScope}:${key}`,
  { getItem: name => localStorage.getItem(name), setItem: (name,value) => localStorage.setItem(name,value) }, adapter.kind === "memory", initial),
  // Server refetches must not replace an unfinished profile document.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [adapter,key]);
  const [state,setState] = useState(recovery.state);
  useEffect(() => { void recovery.start(setState); return () => recovery.stop(); },[recovery]);
  return { draft: state.values, state, recovery, setDraft: recovery.setValues.bind(recovery) };
}
