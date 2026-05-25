import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

const toPosixPath = (value: string) => value.split(path.win32.sep).join('/');

const resolveManualChunk = (id: string) => {
    const normalizedId = toPosixPath(id);
    if (!normalizedId.includes('/node_modules/')) {
      return undefined;
    }

    if (
      normalizedId.includes('/node_modules/leaflet/') ||
      normalizedId.includes('/node_modules/react-leaflet/') ||
      normalizedId.includes('/node_modules/maplibre-gl/')
    ) {
      return 'map-vendor';
    }

    if (
      normalizedId.includes('/node_modules/@tiptap/') ||
      normalizedId.includes('/node_modules/prosemirror/')
    ) {
      return 'editor-vendor';
    }

    if (
      normalizedId.includes('/node_modules/xlsx/') ||
      normalizedId.includes('/node_modules/codepage/') ||
      normalizedId.includes('/node_modules/cfb/') ||
      normalizedId.includes('/node_modules/crc-32/') ||
      normalizedId.includes('/node_modules/ssf/') ||
      normalizedId.includes('/node_modules/wmf/') ||
      normalizedId.includes('/node_modules/word/')
    ) {
      return 'xlsx-vendor';
    }

    if (normalizedId.includes('/node_modules/html5-qrcode/')) {
      return 'scanner-vendor';
    }

    return undefined;
};

const generateVersionJson = () => ({
  name: 'generate-version-json',
  buildStart() {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    let changes = [];
    const changesFile = path.resolve(process.cwd(), '.version-changes.json');
    if (fs.existsSync(changesFile)) {
      const changesData = JSON.parse(fs.readFileSync(changesFile, 'utf-8'));
      changes = changesData.changes || [];
    }

    const versionFile = {
      version: pkg.version,
      releasedAt: new Date().toISOString().replace('Z', '+03:30'),
      changes
    };

    const publicDir = path.resolve(process.cwd(), 'public');
    fs.mkdirSync(publicDir, { recursive: true });
    fs.writeFileSync(path.join(publicDir, 'version.json'), JSON.stringify(versionFile, null, 2));
  }
});

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
      plugins: [react(), generateVersionJson()],
      build: {
        rollupOptions: {
          output: {
            manualChunks: resolveManualChunk,
          },
        },
      },
      optimizeDeps: {
        include: ['@tiptap/react/menus'],
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.npm_package_version)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      test: {
        environment: 'jsdom',
        setupFiles: './test/setup.ts',
        css: true,
      }
    };
});
