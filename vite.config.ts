import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

const toPosixPath = (value: string) => value.split(path.win32.sep).join('/');

const includesAny = (value: string, patterns: string[]) =>
  patterns.some((pattern) => value.includes(pattern));

interface VersionChangesRelease {
  version: string;
  releasedAt?: string;
  changes: string[];
}

const VERSION_MANIFEST_RELEASE_LIMIT = 30;

const normalizeVersionChangesRelease = (value: unknown): VersionChangesRelease | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<VersionChangesRelease>;
  const version = String(candidate.version || '').trim();
  if (!version) return null;

  return {
    version,
    releasedAt: typeof candidate.releasedAt === 'string' && candidate.releasedAt.trim()
      ? candidate.releasedAt.trim()
      : undefined,
    changes: Array.isArray(candidate.changes)
      ? candidate.changes.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
  };
};

const resolveManualChunk = (id: string) => {
    const normalizedId = toPosixPath(id);

    // This screen is shown before route data is available. Keep it independent
    // from feature chunks so a loading state never downloads an editor, map, or
    // module registry just to render a few CSS elements.
    if (
      normalizedId.endsWith('/components/common/BrandLoadingScreen.tsx') ||
      normalizedId.endsWith('/utils/loadingBrand.ts')
    ) {
      return 'brand-loading';
    }

    if (
      normalizedId.endsWith('/moduleRegistry.ts') ||
      normalizedId.endsWith('/types.ts') ||
      normalizedId.endsWith('/utils/processModuleSupport.ts') ||
      normalizedId.endsWith('/utils/assigneeSupport.ts') ||
      normalizedId.endsWith('/utils/assigneeLabel.ts') ||
      normalizedId.includes('/modules/')
    ) {
      return 'module-registry';
    }

    if (!normalizedId.includes('/node_modules/')) {
      return undefined;
    }

    if (normalizedId.includes('/node_modules/@supabase/')) {
      return 'supabase-vendor';
    }

    if (
      includesAny(normalizedId, [
        '/node_modules/@ant-design/icons/',
        '/node_modules/@ant-design/icons-svg/',
      ])
    ) {
      return 'ant-icons-vendor';
    }

    if (
      includesAny(normalizedId, [
        '/node_modules/@tiptap/',
        '/node_modules/prosemirror-',
        '/node_modules/orderedmap/',
        '/node_modules/rope-sequence/',
        '/node_modules/w3c-keyname/',
        '/node_modules/dompurify/',
      ])
    ) {
      return 'editor-vendor';
    }

    if (
      normalizedId.includes('/node_modules/leaflet/') ||
      normalizedId.includes('/node_modules/react-leaflet/') ||
      normalizedId.includes('/node_modules/maplibre-gl/')
    ) {
      return 'map-vendor';
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

    const changesFile = path.resolve(process.cwd(), '.version-changes.json');
    if (!fs.existsSync(changesFile)) {
      throw new Error(`Release changes file is missing: ${changesFile}`);
    }

    const changesData = JSON.parse(fs.readFileSync(changesFile, 'utf-8')) as {
      releases?: unknown[];
    };
    const releases = (Array.isArray(changesData.releases) ? changesData.releases : [])
      .map(normalizeVersionChangesRelease)
      .filter((release): release is VersionChangesRelease => Boolean(release));
    const currentRelease = releases.find((release) => release.version === pkg.version);
    if (!currentRelease) {
      throw new Error(
        `Version ${pkg.version} must have an entry in .version-changes.json. `
        + 'Use an empty changes array when there are no user-facing changes.'
      );
    }

    const releasedAt = new Date().toISOString();
    const versionFile = {
      version: pkg.version,
      releasedAt,
      changes: currentRelease.changes,
      releases: releases.slice(0, VERSION_MANIFEST_RELEASE_LIMIT).map((release) => ({
        ...release,
        releasedAt: release.version === pkg.version ? releasedAt : release.releasedAt,
      })),
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
      plugins: [react({ babel: { compact: false } }), generateVersionJson()],
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
          '@tanstack/react-virtual': path.resolve(__dirname, 'utils/reactVirtualShim.ts'),
        }
      },
      test: {
        environment: 'jsdom',
        setupFiles: './test/setup.ts',
        css: true,
      }
    };
});
