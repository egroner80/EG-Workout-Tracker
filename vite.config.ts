/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const theme = '#0A0B0D'

export default defineConfig({
  // A relative base lets the build run from any static host path; it also
  // becomes the manifest's start_url and scope.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      pwaAssets: { config: true, overrideManifestIcons: true },
      manifest: {
        id: './',
        name: 'Overload — Upper Body Tracker',
        short_name: 'Overload',
        description: 'Guided upper-body workouts with transparent progressive overload.',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: theme,
        background_color: theme,
        lang: 'en',
        categories: ['fitness', 'health'],
      },
      workbox: {
        // Do not list webmanifest here: the plugin precaches it already, and a
        // duplicate entry leaves the precache silently empty.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Launch images are fetched once by iOS at install time; keep them out
        // of the offline cache.
        globIgnores: ['**/apple-splash-*'],
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
      },
      devOptions: { enabled: false, type: 'module' },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
