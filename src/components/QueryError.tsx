function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Centered block for grid/card list pages. */
export function QueryError({ error, label = "Failed to load data." }: { error: unknown; label?: string }) {
  return (
    <div className="text-center py-12 text-destructive">
      <p className="font-medium">{label}</p>
      <p className="text-sm mt-1 text-muted-foreground">{errorMessage(error)}</p>
    </div>
  );
}

/** Inline (non-block) variant for tighter spaces — cards, panels, dialogs. */
export function QueryErrorInline({ error, label = "Failed to load data." }: { error: unknown; label?: string }) {
  return (
    <div className="text-sm text-destructive py-4 text-center">
      <div className="font-medium">{label}</div>
      <div className="text-muted-foreground mt-0.5">{errorMessage(error)}</div>
    </div>
  );
}
