import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";

// The app's version and "what's new" notes live in changelog.json (newest first).
// The build bakes the version into the app and writes /version.json next to it, which
// open copies of the app check to notice a newer version (see src/lib/updates.js).
const changelog = JSON.parse(fs.readFileSync(new URL("./changelog.json", import.meta.url), "utf8"));
const latest = changelog[0];

function versionFile() {
  const body = () => JSON.stringify({ version: latest.version, date: latest.date, changes: changelog.slice(0, 10) });
  return {
    name: "version-file",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: body() });
    },
    configureServer(server) {
      server.middlewares.use("/version.json", (_req, res) => {
        res.setHeader("content-type", "application/json");
        res.setHeader("cache-control", "no-store");
        res.end(body());
      });
    },
  };
}

// In development the PocketBase server runs on :8090 and Vite proxies to it.
export default defineConfig({
  plugins: [react(), versionFile()],
  define: {
    __APP_VERSION__: JSON.stringify(latest.version),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: process.env.PB_URL || "http://127.0.0.1:8090", changeOrigin: true },
      "/_": { target: process.env.PB_URL || "http://127.0.0.1:8090", changeOrigin: true },
    },
  },
});
