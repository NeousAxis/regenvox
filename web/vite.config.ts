import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Le moteur (../src) est écrit pour Node : dans le navigateur, son système de fichiers est en mémoire.
const ici = path.dirname(new URL(import.meta.url).pathname)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Correspondances exactes : node:fs/promises (importé par un SDK, jamais appelé ici) ne doit pas être détourné.
    alias: [
      { find: /^node:fs$/, replacement: path.resolve(ici, 'src/moteur/navigateur/fs.ts') },
      { find: /^node:url$/, replacement: path.resolve(ici, 'src/moteur/navigateur/url.ts') },
      { find: /^node:path$/, replacement: path.resolve(ici, 'node_modules/path-browserify/index.js') },
    ],
  },
  // En développement, le serveur de collecte (PHP) tourne à part : php -S 127.0.0.1:8766 -t public.
  server: { fs: { allow: [path.resolve(ici, '..')] }, proxy: { '/api': 'http://127.0.0.1:8766' } },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
