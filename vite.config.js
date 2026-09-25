import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_TARGET || `http://127.0.0.1:${env.PORT || 5000}`;

  return {
    root: 'frontend',
    plugins: [react()],
    build: {
      outDir: '../dist',
      emptyOutDir: true,
    },
    server: {
      port: 3000,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/webhook': { target: apiTarget, changeOrigin: true },
      },
    },
  };
});
