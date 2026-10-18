import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Sniffari",
        short_name: "Sniffari",
        description: "Where can the dogs go right now? Dog-friendly places and days out around Sydney.",
        theme_color: "#fff6ec",
        background_color: "#fff6ec",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Map style, tiles and fonts: keep what's been seen so the map works with patchy reception
            urlPattern: ({ url }) => url.host === "tiles.openfreemap.org",
            handler: "StaleWhileRevalidate",
            options: { cacheName: "map-tiles", expiration: { maxEntries: 4000, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
          {
            urlPattern: ({ url }) => url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com",
            handler: "CacheFirst",
            options: { cacheName: "fonts", expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  worker: { format: "es" },
  build: { chunkSizeWarningLimit: 1200 },
  test: {
    environment: "node",
    env: { TZ: "UTC" },
  },
});
