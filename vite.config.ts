import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tanstackStart({
      // Modo SPA: gera um shell estático (HTML + JS) que o programa local serve sem Node.
      spa: { enabled: true },
    }),
    react(),
    tailwindcss(),
  ],
  resolve: { dedupe: ["react", "react-dom", "@tanstack/react-router"] },
});
