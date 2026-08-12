import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_PROXY_TARGET ?? "http://localhost:3010";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      allowedHosts: [
        "localhost",
        "sis.skylarbarnes.com",
        ".skylarbarnes.com",
      ],
      proxy: {
        "/auth": apiTarget,
        "/api": apiTarget,
      },
    },
    preview: {
      port: 5173,
      host: true,
      allowedHosts: [
        "localhost",
        "sis.skylarbarnes.com",
        ".skylarbarnes.com",
      ],
      proxy: {
        "/auth": apiTarget,
        "/api": apiTarget,
      },
    },
  };
});
