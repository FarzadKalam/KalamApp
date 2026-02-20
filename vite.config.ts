import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api/melipayamak-rest': {
            target: 'https://rest.payamak-panel.com',
            changeOrigin: true,
            secure: true,
            rewrite: (path) => path.replace(/^\/api\/melipayamak-rest/, ''),
          },
          '/api/melipayamak-soap': {
            target: 'https://api.payamak-panel.com',
            changeOrigin: true,
            secure: true,
            rewrite: (path) => path.replace(/^\/api\/melipayamak-soap/, ''),
          },
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.npm_package_version)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
