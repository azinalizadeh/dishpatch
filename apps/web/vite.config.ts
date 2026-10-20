import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:3000' } },
  },
  build: {
    // Never inline assets as data: URIs; the CSP only allows fonts from 'self'.
    assetsInlineLimit: 0,
  },
});
