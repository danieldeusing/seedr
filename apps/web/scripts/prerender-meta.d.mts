import type { RouteMeta } from "./site-meta.mjs";
export interface ItemRecord {
  type: string;
  slug: string;
  name: string;
  description: string;
  updatedAt?: string;
  /** A wrapper plugin is listed under the capability it wraps as well as under
      plugins — `itemsInCategory` reads both of these to do it. */
  pluginType?: string;
  wrapper?: string;
}
export type Route = RouteMeta & { lastmod?: string };
export function readRegistry(dir?: string): Record<string, ItemRecord[]>;
export function collectRoutes(itemsByType: Record<string, ItemRecord[]>): Route[];
export function renderHead(template: string, meta: RouteMeta): string;
export function renderSitemap(routes: Route[]): string;
export function renderRobots(): string;
export function prerender(distDir?: string): Route[];
