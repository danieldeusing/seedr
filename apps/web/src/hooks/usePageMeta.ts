import { useEffect } from "react";
import { canonicalUrl, type RouteMeta } from "../../scripts/site-meta.mjs";

function setMeta(selector: string, create: () => HTMLMetaElement, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = create();
    document.head.append(element);
  }
  element.content = content;
}

function metaNamed(name: string): HTMLMetaElement {
  const element = document.createElement("meta");
  element.name = name;
  return element;
}

function metaProperty(property: string): HTMLMetaElement {
  const element = document.createElement("meta");
  element.setAttribute("property", property);
  return element;
}

/**
 * Keeps the document head in step with the route on client-side navigation.
 * The prerendered HTML (scripts/prerender-meta.mjs) carries the same values for
 * crawlers; this hook matters for the visitor's tab title, bookmarks and shares.
 */
export function usePageMeta(meta: RouteMeta) {
  const { title, description, index } = meta;
  useEffect(() => {
    document.title = title;
    setMeta('meta[name="description"]', () => metaNamed("description"), description);
    setMeta('meta[property="og:title"]', () => metaProperty("og:title"), title);
    setMeta('meta[property="og:description"]', () => metaProperty("og:description"), description);
    setMeta('meta[name="twitter:title"]', () => metaNamed("twitter:title"), title);
    setMeta('meta[name="twitter:description"]', () => metaNamed("twitter:description"), description);
    setMeta('meta[name="robots"]', () => metaNamed("robots"), index ? "index, follow" : "noindex");

    const url = canonicalUrl(window.location.pathname);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.append(canonical);
    }
    canonical.href = url;
    setMeta('meta[property="og:url"]', () => metaProperty("og:url"), url);
  }, [title, description, index]);
}
