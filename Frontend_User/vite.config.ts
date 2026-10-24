import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// The page calls the backend at /api; the dev and preview servers forward /api to the Raah backend
// (default http://localhost:8000, or BACKEND_URL in .env). Same origin, so no CORS set-up is needed.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.BACKEND_URL || 'http://localhost:8000';
  const proxy = {
    '/api': { target, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/api/, '') },
    // Report photos are stored on the backend and served from there
    '/report-photos': { target, changeOrigin: true },
  };
  return {
    plugins: [react()],
    resolve: { alias: { '@': '/src' } },
    // strictPort: always 5174 (4174 for preview). If the port is busy, Vite stops with an error instead of
    // quietly moving to 5175, 5176… (Frontend/ uses 5173).
    server: { port: 5174, strictPort: true, host: true, proxy },
    preview: { port: 4174, strictPort: true, host: true, proxy },
  };
});
