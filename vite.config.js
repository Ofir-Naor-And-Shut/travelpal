import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Honour a PORT handed in by the environment (e.g. the preview launcher),
  // falling back to Vite's usual default for a plain `npm run dev`.
  server: {
    port: Number(process.env.PORT) || 5173,
  },
})
