import 'dotenv/config'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import express from 'express'
import { registerRoutes } from './api/routes.js'

function apiPlugin() {
  return {
    name: 'daylo-api',
    configureServer(server) {
      const api = express()
      api.use(express.json())
      registerRoutes(api)
      server.middlewares.use(api)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), apiPlugin()],
  server: {
    host: true,
    watch: {
      ignored: ['**/daylo.db', '**/daylo.db-wal', '**/daylo.db-shm'],
    },
  },
})
