import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.PORT) || 5199,
    strictPort: false,
    proxy: {
      "/api": "https://9llmk10gkk.execute-api.ap-south-1.amazonaws.com/default",
      "/uploads": "https://9llmk10gkk.execute-api.ap-south-1.amazonaws.com/default",
    },
  },
})
