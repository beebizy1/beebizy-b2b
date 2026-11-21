import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Identity } from "@/data/adapter";
import {
  parseAccountExperience,
  resolveAccountExperience,
  type AccountExperience,
} from "@/data/accountExperience";
import { AccountExperienceContext } from "./accountExperienceContext";

const storageKey = (userId: string, workspaceId: string) => `beebizy:account-experience:${userId}:${workspaceId}`;

function readSavedExperience(userId: string | undefined, workspaceId: string | undefined): AccountExperience | null {
  if (!userId || !workspaceId) return null;
  return parseAccountExperience(window.localStorage.getItem(storageKey(userId,workspaceId)));
}

export function AccountExperienceProvider({
  identity,
  children,
}: {
  identity: Identity | undefined;
  children: ReactNode;
}) {
  const [savedExperience, setSavedExperience] = useState<AccountExperience | null>(() =>
    readSavedExperience(identity?.userId,identity?.workspaceId),
  );

  useEffect(() => {
    setSavedExperience(readSavedExperience(identity?.userId,identity?.workspaceId));
  }, [identity?.userId,identity?.workspaceId]);

  const assigned = identity?.experience ?? "standard";
  const canSwitchExperience = identity?.canSwitchExperience ?? false;
  const experience = resolveAccountExperience(assigned, canSwitchExperience, savedExperience);

  const setExperience = useCallback(
    (nextExperience: AccountExperience) => {
      if (!identity?.canSwitchExperience) return;
      window.localStorage.setItem(storageKey(identity.userId,identity.workspaceId), nextExperience);
      setSavedExperience(nextExperience);
    },
    [identity],
  );

  const value = useMemo(
    () => ({ experience, canSwitchExperience, setExperience }),
    [canSwitchExperience, experience, setExperience],
  );

  return <AccountExperienceContext.Provider value={value}>{children}</AccountExperienceContext.Provider>;
}
