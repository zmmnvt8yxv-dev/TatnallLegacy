declare module "/app.js" {
  import type { dataLoader } from "../data/loader";

  export function initLegacyApp(options: { dataLoader: typeof dataLoader }): () => void;
  export function cleanupLegacyApp(): void;
}
