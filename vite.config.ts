import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Жергілікті әзірлеуде /api сұраулары scripts/dev-api.mjs серверіне жіберіледі.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3001' } },
})
