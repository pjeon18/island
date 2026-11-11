import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  server: { port: 5600, strictPort: true },
  plugins: [
    {
      // Dev only: POST a PNG data URL to /__shot?name=x and it lands in shots/x.png,
      // so the canvas can be inspected at full pixel size.
      name: 'dev-shot',
      apply: 'serve',
      configureServer(server) {
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
