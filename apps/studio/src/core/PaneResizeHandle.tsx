/**
 * A drag handle between two panes, reporting deltas along one axis while
 * dragging. `x` sits between side-by-side panes and reports width; `y` sits
 * under a pane and reports height.
 */
export function PaneResizeHandle({ onResize, label, axis = "x" }: { onResize(delta: number): void; label: string; axis?: "x" | "y" }) {
  const startDrag = (event: React.MouseEvent) => {
    event.preventDefault();
    let last = axis === "x" ? event.clientX : event.clientY;
    const onMove = (move: MouseEvent) => {
      const next = axis === "x" ? move.clientX : move.clientY;
      onResize(next - last);
      last = next;
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseup", onUp, { passive: true });
  };
  const shape =
    axis === "x" ? "w-3 cursor-col-resize items-stretch justify-center" : "h-3 w-full cursor-row-resize flex-col items-stretch justify-center";
  return (
    <div role="presentation" aria-label={label} onMouseDown={startDrag} className={`group flex shrink-0 ${shape}`}>
      <div className={`${axis === "x" ? "w-px" : "h-px"} bg-border transition-colors group-hover:bg-primary`} />
    </div>
  );
}
