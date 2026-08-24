/** A vertical drag handle between two panes; reports x-deltas while dragging. */
export function PaneResizeHandle({ onResize, label }: { onResize(delta: number): void; label: string }) {
  const startDrag = (event: React.MouseEvent) => {
    event.preventDefault();
    let lastX = event.clientX;
    const onMove = (move: MouseEvent) => {
      onResize(move.clientX - lastX);
      lastX = move.clientX;
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseup", onUp, { passive: true });
  };
  return (
    <div role="presentation" aria-label={label} onMouseDown={startDrag} className="group flex w-3 shrink-0 cursor-col-resize items-stretch justify-center">
      <div className="w-px bg-border transition-colors group-hover:bg-primary" />
    </div>
  );
}
