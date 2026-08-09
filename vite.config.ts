import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const baseUrl = process.env.CAPACITOR
  ? './'
  : process.env.NETLIFY
    ? '/'
    : '/TatnallLegacy/';

export default defineConfig({
  base: baseUrl,
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    '__APP_BASE_URL__': JSON.stringify(baseUrl),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@sentry")) return "monitoring";
          if (id.includes("framer-motion")) return "motion";
          if (id.includes("@tanstack")) return "query";
          if (
            id.includes("react-dom")
            || id.includes("react-router")
            || /node_modules\/react\//.test(id)
            || id.includes("/scheduler/")
            || id.includes("/react-is/")
            || id.includes("/use-sync-external-store/")
          ) return "react-vendor";
          if (id.includes("zod")) return "validation";
          if (id.includes("lucide-react")) return "icons";
          return "vendor";
        },
      },
    },
  },
});
