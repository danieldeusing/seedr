/// <reference types="vite/client" />

declare module "virtual:seedr-private-registry" {
  import type { RegistryItem } from "@seedr/shared";
  const data: { items: RegistryItem[] };
  export default data;
}

declare module "virtual:seedr-public-registry" {
  import type { RegistryItem } from "@seedr/shared";
  const data: {
    version: string;
    items: RegistryItem[];
    itemJsonLoaders: Record<string, () => Promise<{ default: RegistryItem }>>;
  };
  export default data;
}
