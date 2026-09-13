import { useContext } from "react";
import { AccountExperienceContext, type AccountExperienceContextValue } from "./accountExperienceContext";

export function useAccountExperience(): AccountExperienceContextValue {
  const context = useContext(AccountExperienceContext);
  if (!context) throw new Error("useAccountExperience must be used inside AccountExperienceProvider.");
  return context;
}
