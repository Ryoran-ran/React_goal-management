import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig(({ mode }) => {
  const base = mode === "github-pages" ? "/React_goal-management/" : "/";
  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: "prompt",
        injectRegister: "auto",
        includeAssets: ["icon.svg", "icon-192.png", "icon-512.png"],
        scope: base,
        manifest: {
          name: "Dance Note 社交ダンス練習ノート",
          short_name: "Dance Note",
          lang: "ja",
          id: base,
          start_url: base,
          scope: base,
          display: "standalone",
          background_color: "#f5f7f7",
          theme_color: "#183d3d",
          icons: [
            { src: `${base}icon-192.png`, sizes: "192x192", type: "image/png" },
            {
              src: `${base}icon-512.png`,
              sizes: "512x512",
              type: "image/png",
              purpose: "any maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
          navigateFallback: `${base}index.html`,
          cleanupOutdatedCaches: true,
        },
      }),
    ],
  };
});
