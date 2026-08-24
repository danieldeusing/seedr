import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "../ui/Button";

interface PreviewErrorBoundaryProps {
  /** Changing this value resets the boundary (e.g. the selected file path). */
  resetKey: string;
  children: ReactNode;
}

interface PreviewErrorBoundaryState {
  error: Error | null;
  resetKey: string;
}

/**
 * Keeps a failing preview (a lazy chunk that didn't load, a renderer that threw
 * on unexpected content) from taking the whole detail page down. Offers a retry
 * that remounts the preview.
 */
export class PreviewErrorBoundary extends Component<PreviewErrorBoundaryProps, PreviewErrorBoundaryState> {
  state: PreviewErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<PreviewErrorBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(
    props: PreviewErrorBoundaryProps,
    state: PreviewErrorBoundaryState
  ): Partial<PreviewErrorBoundaryState> | null {
    // a new file selection gets a fresh start
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("file preview failed", error, info.componentStack);
  }

  retry = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="flex flex-col items-start gap-2 p-3 text-sm text-destructive">
          <span className="flex items-center gap-2">
            <AlertCircle className="size-3.5 shrink-0" aria-hidden />
            The preview could not be rendered.
          </span>
          <Button variant="outline" size="xs" onClick={this.retry}>
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
