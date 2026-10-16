/** Collects messages from Drizzle/driver cause chains without exposing query parameters to users. */
export function errorMessages(error: unknown): string[] {
  const messages: string[] = [];
  for (let current: unknown = error, depth = 0; current != null && depth < 6; depth += 1) {
    const candidate = current as { message?: unknown; cause?: unknown };
    if (typeof candidate.message === "string") messages.push(candidate.message);
    current = candidate.cause;
  }
  return messages;
}

export function databaseErrorMessage(error: unknown): string {
  return errorMessages(error).at(-1) ?? "The database rejected this operation.";
}
