declare module "@registry/manifest.json" {
  import type { RegistryManifestIndex } from "@/lib/types";
  const manifest: RegistryManifestIndex;
  export default manifest;
}

declare module "@registry/*/manifest.json" {
  import type { TypeManifest } from "@/lib/types";
  const data: TypeManifest;
  export default data;
}
