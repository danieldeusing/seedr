import type { ComponentType } from "@seedr/shared";
import type { ContentHandler } from "./types.js";

const handlers = new Map<ComponentType, ContentHandler>();

/**
 * Register a content handler for a specific type.
 */
export function registerHandler(handler: ContentHandler): void {
  handlers.set(handler.type, handler);
}

/**
 * Get the handler for a specific content type.
 */
export function getHandler(type: ComponentType): ContentHandler | undefined {
  return handlers.get(type);
}

/**
 * Check if a handler exists for a specific content type.
 */
export function hasHandler(type: ComponentType): boolean {
  return handlers.has(type);
}

/**
 * Get all registered content types.
 */
export function getRegisteredTypes(): ComponentType[] {
  return Array.from(handlers.keys());
}
