/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Basis-Pfad: Der GitHub-Actions-Workflow setzt BASE_PATH auf den Pages-Unterordner (z. B. "/neon-knobel/"),
// damit Service-Worker-Scope, Manifest und Icons absolut unter dem Pages-Link liegen.
// Ohne BASE_PATH (lokal, Netlify, Cloudflare) bleibt es bei relativen Pfaden.
const rawBase = process.env.BASE_PATH?.trim();
const base = rawBase ? `/${rawBase.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/') : './';

export default defineConfig({
  base,
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: { output: { manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined) } },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'NEON KNOBEL',
        short_name: 'NEON KNOBEL',
        description: 'Cyberpunk-Würfelspiel mit Spielblock – Online-Multiplayer & Bots',
        lang: 'de',
        start_url: './',
        scope: './',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'portrait',
        background_color: '#05030c',
        theme_color: '#05030c',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,webmanifest}'],
        navigateFallback: 'index.html',
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  test: { include: ['tests/**/*.test.ts'] },
});
