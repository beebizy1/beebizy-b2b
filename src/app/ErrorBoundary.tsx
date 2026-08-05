/**
 * Last line of defence. Without this, one thrown render error blanks the whole tab and
 * the user sees nothing at all — which is what the previous build did.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept as console output deliberately: there is no error reporting service wired up,
    // and swallowing this would make production crashes undebuggable.
    console.error("[beebizy] render error", error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="grid min-h-dvh place-items-center bg-background px-6">
        <div className="w-full max-w-lg space-y-4 rounded-xl border border-card-border bg-card p-6 shadow-sm">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-foreground">Something broke on this screen</h1>
            <p className="text-sm text-muted-foreground">
              The rest of the app is fine. Reloading usually clears it — the details below help if it doesn't.
            </p>
          </div>
          <pre className="max-h-40 overflow-auto rounded-lg bg-surface-sunken p-3 font-mono text-xs text-foreground">
            {error.message}
          </pre>
          <div className="flex gap-2">
            <Button onClick={() => window.location.reload()}>Reload</Button>
            <Button variant="outline" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
