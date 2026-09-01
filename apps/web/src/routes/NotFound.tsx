import { Link } from "react-router-dom";
import { usePageMeta } from "@/hooks/usePageMeta";
import { notFoundMeta } from "../../scripts/site-meta.mjs";

/** Rendered for unknown routes and unknown items; served with a 404 status by dist/404.html on Pages. */
export function NotFound({ message = "Page not found" }: { message?: string }) {
  usePageMeta(notFoundMeta());
  return (
    <div className="mx-auto max-w-[var(--content-w)] px-4 py-12 text-center">
      <p className="prompt">cat {window.location.pathname.slice(1) || "index"}</p>
      <h1 className="mt-4 text-lg font-semibold text-foreground">{message}</h1>
      <p className="mt-2 text-subtext">No such file or directory (404)</p>
      <Link to="/" className="link-quiet mt-4 inline-block">
        Go home
      </Link>
    </div>
  );
}
