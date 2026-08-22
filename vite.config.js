import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vercel sets VERCEL_GIT_COMMIT_SHA for every build, so each deployment gets a
// distinct id baked into the bundle (see define below) and mirrored into
// version.json (see buildVersionFile below). The client polls version.json and
// compares it against its own baked-in id to detect a newer deployment - see
// src/utils/versionCheck.js. Falls back to a timestamp for local builds.
const buildId = process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now())

// Emits dist/version.json alongside the rest of the build output so the
// deployed site serves it at /version.json.
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
