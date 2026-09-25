import { isDataError } from "../data/adapter.ts";

/** Only identity failures belong on the account-access page. Server failures stay retryable. */
export function identityErrorRequiresAccessDenied(error: unknown): boolean {
  return isDataError(error) && (error.code === "unauthenticated" || error.code === "permission-denied");
}
