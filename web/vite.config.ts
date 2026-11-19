import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({ plugins: [react()], build: { target: "es2022", chunkSizeWarningLimit: 1500 }, test: { include: ["test/**/*.test.ts"] } } as never);
