import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
