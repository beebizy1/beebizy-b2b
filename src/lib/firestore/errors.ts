export class FirestoreOpError extends Error {
  readonly name = "FirestoreOpError";
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const NON_RETRYABLE_CODES = new Set([
  "permission-denied",
  "not-found",
  "already-exists",
  "failed-precondition",
  "invalid-argument",
  "unauthenticated",
]);

/** True for errors that won't succeed on retry (bad rules, missing doc, not signed in, etc). */
export function isNonRetryable(error: unknown): boolean {
  if (error instanceof FirestoreOpError) return NON_RETRYABLE_CODES.has(error.code);
  if (error && typeof error === "object" && "code" in error && typeof (error as { code: unknown }).code === "string") {
    return NON_RETRYABLE_CODES.has((error as { code: string }).code);
  }
  return false;
}
