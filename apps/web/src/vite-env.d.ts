/// <reference types="vite/client" />

declare module "virtual:seedr-private-registry" {
  import type { RegistryItem } from "@seedr/shared";
  const data: { items: RegistryItem[] };
  export default data;
}
