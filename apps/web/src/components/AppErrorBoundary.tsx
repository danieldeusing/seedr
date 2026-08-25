import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

/**
 * Last resort for a render throw anywhere in the route tree. Without it React
 * unmounts the whole tree and the visitor gets a blank white page with the
 * reason only in the console.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("app render failed", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="mb-2 text-lg text-foreground">Something went wrong</h1>
        <p className="mb-6 text-md text-muted-foreground">
          This page failed to render. Reloading usually fixes it.
        </p>
        <button
          type="button"
          className="border border-border px-3 py-1 text-md text-foreground hover:bg-secondary"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    );
  }
}
