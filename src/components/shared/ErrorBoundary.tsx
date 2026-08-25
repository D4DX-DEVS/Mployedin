"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportError } from "@/lib/observability/report-error";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback UI. Receives error and reset function. */
  fallback?: (props: { error: Error; reset: () => void }) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Reusable error boundary for wrapping dashboard sections.
 * Catches render errors and displays a fallback UI with a retry button.
 *
 * @example
 * <ErrorBoundary>
 *   <KanbanBoard />
 * </ErrorBoundary>
 *
 * @example with custom fallback. Log technical details privately and keep the
 * visible message task-focused.
 * <ErrorBoundary fallback={({ reset }) => (
 *   <div>
 *     <p>We could not load this section. Nothing was changed.</p>
 *     <button onClick={reset}>Retry</button>
 *   </div>
 * )}>
 *   <AnalyticsChart />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, {
      source: "component-error-boundary",
      componentStack: info.componentStack ?? undefined,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          reset: this.handleReset,
        });
      }

      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-4 rounded-lg border border-destructive/20 bg-destructive/5 p-8"
        >
          <div className="text-center space-y-2">
            <h3 className="heading-subsection font-semibold text-destructive">
              We couldn&apos;t load this section
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Nothing was changed. Try again, or reload the page if the problem continues.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={this.handleReset}
              className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="min-h-11 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
