import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During development the React dev server proxies API + uploads to the
// Express backend on port 4000, so the frontend can call relative URLs.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
});
