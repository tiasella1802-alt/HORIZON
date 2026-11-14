import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the build works on GitHub Pages or any static host subpath.
// Listen on IPv4 explicitly: on Windows, Node can resolve "localhost" to IPv6 [::1] only, while
// browsers try 127.0.0.1 and get "refused to connect".
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { host: "127.0.0.1", port: 5173 },
  preview: { host: "127.0.0.1" },
});
