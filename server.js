import 'dotenv/config'
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { registerRoutes } from './api/routes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3000

const app = express()
app.use(express.json())
registerRoutes(app)

app.use(express.static(path.join(__dirname, 'dist')))
// SPA fallback: only for non-API, non-upload paths
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next()
  res.sendFile(path.join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => console.log(`🚀 daylo server läuft auf Port ${PORT}`))
