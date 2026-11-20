import { defineConfig } from "vite";
export default defineConfig({
  server: { proxy: { "/api/rpc": { target: "http://devnet.rialo.io:4100", rewrite: () => "/" } } },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
  test: { include: ["test/**/*.test.ts"] },
} as never);
