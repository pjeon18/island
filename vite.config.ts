import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  // stamps data URLs so a new deploy never pairs new code with cached data (Pages caches 10 minutes)
  define: { __BUILD__: JSON.stringify(Date.now().toString(36)) },
  server: { port: 5600, strictPort: true },
  // three pages: the island, the dungeon (dungeon.html) and the map editor (editor.html)
  build: { rollupOptions: { input: { main: 'index.html', dungeon: 'dungeon.html', editor: 'editor.html' } } },
  plugins: [
    {
      // Dev only: POST a PNG data URL to /__shot?name=x and it lands in shots/x.png,
      // so the canvas can be inspected at full pixel size.
      name: 'dev-shot',
      apply: 'serve',
      configureServer(server) {
        // Dev only: the map editor's "Save to project" writes public/dungeons/<id>.json and the index
        server.middlewares.use('/__dungeon', (req, res) => {
          let body = ''
          req.on('data', (c) => (body += c))
          req.on('end', () => {
            try {
              const map = JSON.parse(body)
              const id = String(map.id ?? '').replace(/[^\w-]/g, '')
              if (!id) throw new Error('no id')
              const dir = path.join('public', 'dungeons')
              fs.mkdirSync(dir, { recursive: true })
              fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(map, null, 1))
              const indexPath = path.join(dir, 'index.json')
              const index: { id: string; name: string }[] = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : []
              const at = index.findIndex((e) => e.id === id)
              const entry = { id, name: String(map.name ?? id) }
              if (at >= 0) index[at] = entry
              else index.push(entry)
              fs.writeFileSync(indexPath, JSON.stringify(index, null, 1))
              res.end('ok')
            } catch (e) {
              res.statusCode = 400
              res.end(String(e))
            }
          })
        })
        server.middlewares.use('/__shot', (req, res) => {
          let body = ''
          req.on('data', (c) => (body += c))
          req.on('end', () => {
            const name = (new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'shot').replace(/[^\w-]/g, '')
            fs.mkdirSync('shots', { recursive: true })
            fs.writeFileSync(path.join('shots', `${name}.png`), Buffer.from(body.split(',')[1] ?? '', 'base64'))
            res.end('ok')
          })
        })
      },
    },
  ],
})
