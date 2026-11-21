import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  // The build is served from /apps/tidal-letters/ inside the desk and from any folder on its own.
  base: "./",
  plugins: [preact()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // The page the manifest names; the kit's files stay at the tree's root beside it.
    rollupOptions: { input: { reader: "reader/index.html" } },
  },
});
