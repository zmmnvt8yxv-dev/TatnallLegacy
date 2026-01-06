import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: (process.env.CAPACITOR ? './' : '/TatnallLegacy/'),
  plugins: [react()],
});
