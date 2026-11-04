import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the PocketBase server runs on :8090 and Vite proxies to it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: process.env.PB_URL || "http://127.0.0.1:8090", changeOrigin: true },
      "/_": { target: process.env.PB_URL || "http://127.0.0.1:8090", changeOrigin: true },
    },
  },
});
