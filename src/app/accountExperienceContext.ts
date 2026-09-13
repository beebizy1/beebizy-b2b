import { createContext } from "react";
import type { AccountExperience } from "@/data/accountExperience";

export interface AccountExperienceContextValue {
  experience: AccountExperience;
  canSwitchExperience: boolean;
  setExperience: (experience: AccountExperience) => void;
}

export const AccountExperienceContext = createContext<AccountExperienceContextValue | null>(null);
