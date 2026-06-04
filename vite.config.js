import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// API plugin only runs during `vite dev` — NOT during `vite build`
// (dynamic import avoids loading better-sqlite3 / routes.js during production build)
function apiPlugin() {
  return {
    name: 'daylo-api',
    async configureServer(server) {
      const { default: express } = await import('express')
      const { registerRoutes }   = await import('./api/routes.js')
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
