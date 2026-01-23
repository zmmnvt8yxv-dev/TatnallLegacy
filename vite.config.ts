import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const baseUrl = process.env.CAPACITOR ? './' : '/TatnallLegacy/';

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
});
