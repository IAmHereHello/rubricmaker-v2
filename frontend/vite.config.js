import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Inline (empty) PostCSS config: stops Vite from picking up a postcss.config.js
  // from a parent folder, e.g. an unrelated project in ~/rubricmaker on a Mac.
  css: { postcss: {} },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
          'vendor-pdf': ['jspdf', 'html2canvas'],
          'vendor-math': ['katex'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
  server: {
    port: parseInt(process.env.PORT || '3000'),
    host: true,   // listen on all interfaces (needed for Tailscale access)
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
