import { build } from 'esbuild';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
await build({
  entryPoints: [process.env.UI_PREVIEW_ENTRY || 'scripts/qa/feedback-fixture.tsx'], outdir: process.env.UI_PREVIEW_DIR || process.env.FEEDBACK_PREVIEW_DIR || 'tmp/feedback-preview',
  entryNames: 'entry', chunkNames: '[name]-[hash]', bundle: true, splitting: true, format: 'esm', platform: 'browser', minify: true,
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': JSON.stringify({ DEV: false, PROD: true, MODE: 'test', BASE_URL: '/', VITE_SUPABASE_URL: 'https://isolated-preview.invalid', VITE_SUPABASE_ANON_KEY: 'isolated-preview-only' }), __TAZESYSTEM_APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [{ name: 'isolated-feedback-backend', setup(builder) {
    if (process.env.UI_PREVIEW_ENTRY?.includes('sidebar-fixture')) {
      builder.onResolve({ filter: /\/(?:ContextualTutorialButton|TazeSystemAttribution)$/ }, () => ({ path: 'sidebar-decoration', namespace: 'sidebar-preview' }));
      builder.onLoad({ filter: /.*/, namespace: 'sidebar-preview' }, () => ({ contents: 'export default function Decoration(){ return null; }', loader: 'js' }));
    }
    // The package-root icon shims export an object around the component. Vite
    // normalizes these in production; use the ESM components in this fixture.
    builder.onResolve({ filter: /^@ant-design\/icons\/[A-Z][\w]+$/ }, ({ path }) => ({ path: require.resolve(path.replace('@ant-design/icons/', '@ant-design/icons/es/icons/') + '.js') }));
    builder.onResolve({ filter: /(^|\/)supabaseClient(?:\.ts)?$/ }, () => ({ path: 'supabase-preview', namespace: 'feedback-preview' }));
    builder.onLoad({ filter: /.*/, namespace: 'feedback-preview' }, () => ({ contents: `
      const query = new Proxy(function(){}, { get: (_, key) => key === 'then' ? (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject) : query, apply: () => query });
      export const supabase = query; export const supabasePublic = query; export const supabaseSignUpClient = query;
      export const SUPABASE_URL = 'https://isolated-preview.invalid'; export const SUPABASE_ANON_KEY = 'isolated-preview-only'; export const SUPABASE_AUTH_STORAGE_KEY = 'isolated-preview-auth';
    `, loader: 'js' }));
  } }],
});
console.log('Built isolated feedback preview with a fake backend; this directory is not part of dist.');
