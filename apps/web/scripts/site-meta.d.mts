export interface RouteMeta {
  path: string;
  title: string;
  description: string;
  index: boolean;
}
export type RegistryType = "skill" | "hook" | "agent" | "plugin" | "command" | "settings" | "mcp";
export const SITE_ORIGIN: string;
export const SITE_NAME: string;
export const DEFAULT_DESCRIPTION: string;
export const TYPE_PATHS: Record<RegistryType, string>;
export const TYPE_LABELS: Record<RegistryType, string>;
export const TYPE_LABELS_PLURAL: Record<RegistryType, string>;
export function homeMeta(): RouteMeta;
export function privacyMeta(): RouteMeta;
export function impressumMeta(): RouteMeta;
export function notFoundMeta(): RouteMeta;
export function itemsInCategory<T extends { type: string; pluginType?: string; wrapper?: string }>(
  items: readonly T[],
  type: RegistryType
): T[];
export function categoryMeta(type: RegistryType, count: number): RouteMeta;
export function itemMeta(item: { type: RegistryType; slug: string; name: string; description: string }): RouteMeta;
export function canonicalUrl(path: string): string;
