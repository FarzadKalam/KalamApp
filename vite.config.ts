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

const readAppVersion = () => {
  const pkgPath = path.resolve(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: unknown };
  const version = String(pkg.version || '').trim();
  if (!version) {
    throw new Error('Application version is missing from package.json.');
  }
  return version;
};

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
    const version = readAppVersion();

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
    const currentRelease = releases.find((release) => release.version === version);
    if (!currentRelease) {
      throw new Error(
        `Version ${version} must have an entry in .version-changes.json. `
        + 'Use an empty changes array when there are no user-facing changes.'
      );
    }

    const releasedAt = new Date().toISOString();
    const versionFile = {
      version,
      releasedAt,
      changes: currentRelease.changes,
      releases: releases.slice(0, VERSION_MANIFEST_RELEASE_LIMIT).map((release) => ({
        ...release,
        releasedAt: release.version === version ? releasedAt : release.releasedAt,
      })),
    };

    const publicDir = path.resolve(process.cwd(), 'public');
    fs.mkdirSync(publicDir, { recursive: true });
    fs.writeFileSync(path.join(publicDir, 'version.json'), JSON.stringify(versionFile, null, 2));
  }
});

const SERVICE_WORKER_CACHE_VERSION_TOKEN = '__TAZESYSTEM_CACHE_VERSION__';

const stampServiceWorkerCacheVersion = () => {
  let outputDirectory = '';

  return {
    name: 'stamp-service-worker-cache-version',
    configResolved(config: { build: { outDir: string } }) {
      outputDirectory = config.build.outDir;
    },
    closeBundle() {
      const pkgPath = path.resolve(process.cwd(), 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: unknown };
      const version = String(pkg.version || '').trim();
      if (!version) {
        throw new Error('Cannot stamp the service worker cache without an application version.');
      }

      const serviceWorkerPath = path.join(outputDirectory, 'sw.js');
      if (!fs.existsSync(serviceWorkerPath)) {
        throw new Error(`Service worker output is missing: ${serviceWorkerPath}`);
      }

      const source = fs.readFileSync(serviceWorkerPath, 'utf-8');
      if (!source.includes(SERVICE_WORKER_CACHE_VERSION_TOKEN)) {
        throw new Error('Service worker cache version token is missing from the build output.');
      }

      fs.writeFileSync(
        serviceWorkerPath,
        source.replaceAll(SERVICE_WORKER_CACHE_VERSION_TOKEN, `v${version}`),
      );
    },
  };
};

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
      plugins: [
        react({ babel: { compact: false } }),
        generateVersionJson(),
        stampServiceWorkerCacheVersion(),
      ],
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
        __TAZESYSTEM_APP_VERSION__: JSON.stringify(readAppVersion()),
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
        // چند فایل UI/PDF سنگین هم‌زمان، زمان‌سنج آزمون‌ها را به‌صورت کاذب
        // مصرف می‌کردند. اجرای ترتیبی، نتیجهٔ قطعی و تکرارپذیر می‌دهد.
        fileParallelism: false,
        // رابط‌های Ant Design در آزمون‌های یکپارچهٔ سنگین (به‌ویژه پیش‌نمایش چاپ)
        // با وجود پایان صحیح، از سقف پیش‌فرض پنج‌ثانیه عبور می‌کنند.
        testTimeout: 20_000,
      }
    };
});
