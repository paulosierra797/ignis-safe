import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vercel sets VERCEL_GIT_COMMIT_SHA for every build, so each deployment gets a
// distinct id that is (a) baked into this bundle via `define` below and
// (b) mirrored into dist/version.json by the plugin below, served live at
// /version.json. A tab that fails to load a lazy chunk can then ask
// version.json whether a genuinely newer deployment exists before deciding to
// show the "Update available" screen - see src/utils/deployVersion.js. Falls
// back to a build timestamp for local `vite build`.
const buildId = process.env.VERCEL_GIT_COMMIT_SHA || `local-${Date.now()}`

// Emits dist/version.json alongside the rest of the build output so the
// deployed site serves the current build id at /version.json.
function buildVersionFile() {
  return {
    name: 'ignis-safe-build-version',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ buildId })
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), buildVersionFile()],
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId)
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll('\\', '/')
          // Vite's dynamic-import preload helper is a virtual module imported by
          // every lazy route chunk. Left unassigned, Rollup co-locates it with a
          // heavy vendor chunk (jspdf/jspdf-autotable), which then gets pulled
          // onto every route - ~134 KB of unused JS on pages that never export a
          // PDF. Pin the helpers to vendor-react, which already loads everywhere.
          if (
            normalizedId.includes('vite/preload-helper')
            || normalizedId.includes('vite/modulepreload-polyfill')
            || normalizedId.includes('vite/dynamic-import-helper')
          ) {
            return 'vendor-react'
          }
          if (!normalizedId.includes('/node_modules/')) return undefined
          if (/node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return 'vendor-react'
          }
          if (normalizedId.includes('/node_modules/@supabase/')) return 'vendor-supabase'
          if (
            normalizedId.includes('/node_modules/chart.js/')
            || normalizedId.includes('/node_modules/react-chartjs-2/')
          ) return 'vendor-charts'
          if (
            normalizedId.includes('/node_modules/jspdf/')
            || normalizedId.includes('/node_modules/jspdf-autotable/')
          ) return 'vendor-documents'
          if (
            normalizedId.includes('/node_modules/@mediapipe/')
            || normalizedId.includes('/node_modules/@techstark/')
            || normalizedId.includes('/node_modules/@vladmandic/')
            || normalizedId.includes('/node_modules/react-webcam/')
          ) {
            return 'vendor-vision'
          }
          return undefined
        }
      }
    }
  },
  worker: {
    format: 'es'
  }
})
