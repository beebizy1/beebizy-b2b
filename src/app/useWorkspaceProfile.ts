import { useMe } from "@/data/hooks";
import { normalizeWorkspaceProfile } from "@/data/workspaceProfile";

export function useWorkspaceProfile() {
  const { data } = useMe();
  return data?.workspace?.profile ?? normalizeWorkspaceProfile(null, data?.experience);
}
