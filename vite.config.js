import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// Writes the offline file list + a fresh version into dist/sw.js after each build.
function offlinePrecache() {
  return {
    name: 'offline-precache',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve('dist')
      const files = []
      const walk = (dir) => {
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, f.name)
          if (f.isDirectory()) walk(full)
          else files.push('/' + path.relative(dist, full).split(path.sep).join('/'))
        }
      }
      walk(dist)
      const list = ['/', ...files.filter((f) => f !== '/sw.js' && !f.endsWith('.map') && !f.endsWith('.woff'))]
      const id = Date.now().toString(36)
      const sw = path.join(dist, 'sw.js')
      const src = fs.readFileSync(sw, 'utf8')
        .replace('__BUILD_ID__', id)
        .replace("self.__PRECACHE__ || ['/', '/index.html']", JSON.stringify(list))
      fs.writeFileSync(sw, src)
      console.log(`offline-precache: ${list.length} files, version ${id}`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), offlinePrecache()],
  build: {
    rollupOptions: {
      output: {
        // three.js changes rarely: keep it in its own long-cached file
        manualChunks: { three: ['three'], r3f: ['@react-three/fiber', '@react-three/drei', 'camera-controls'] },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
})
