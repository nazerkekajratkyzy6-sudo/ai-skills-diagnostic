// Жергілікті әзірлеуге арналған /api сервері (Vercel-де қажет емес).
// Локальный сервер /api для разработки (на Vercel не нужен). Запуск: node scripts/dev-api.mjs
import http from 'node:http'
import fs from 'node:fs'
import handler from '../api/admin.js'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
  }
}

http.createServer((req, res) => {
  if (req.url.startsWith('/api/admin')) return handler(req, res)
  res.statusCode = 404; res.end('not found')
}).listen(3001, () => console.log('dev api on http://localhost:3001'))
