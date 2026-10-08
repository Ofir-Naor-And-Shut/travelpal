import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // jspdf lazily `import()`s canvg from `addSvgAsImage`, which this app
      // never calls, and npm does not install that optional dependency. Vite 8
      // fails on the unresolvable specifier — in the dev server's import
      // analysis as well as the build — so point it at a local stub. An alias
      // (rather than marking it external) is what covers both. See
      // src/lib/canvg-stub.js.
      canvg: fileURLToPath(new URL('./src/lib/canvg-stub.js', import.meta.url)),
    },
  },
  // Honour a PORT handed in by the environment (e.g. the preview launcher),
  // falling back to Vite's usual default for a plain `npm run dev`.
  server: {
    port: Number(process.env.PORT) || 5173,
    // A stray .venv (unrelated Python virtualenv, not part of this project)
    // sits in the repo root; watching its locked python.exe crashes the dev
    // server on Windows with an unhandled EBUSY.
    watch: {
      ignored: ['**/.venv/**'],
    },
  },
})
