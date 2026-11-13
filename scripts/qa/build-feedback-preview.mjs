import { build } from 'esbuild';
import fs from 'node:fs';
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
await build({
  entryPoints: ['scripts/qa/feedback-fixture.tsx'], outdir: process.env.FEEDBACK_PREVIEW_DIR || 'tmp/feedback-preview',
  entryNames: 'entry', chunkNames: '[name]-[hash]', bundle: true, splitting: true, format: 'esm', platform: 'browser', minify: true,
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': JSON.stringify({ DEV: false, PROD: true, MODE: 'test', BASE_URL: '/', VITE_SUPABASE_URL: 'https://isolated-preview.invalid', VITE_SUPABASE_ANON_KEY: 'isolated-preview-only' }), __TAZESYSTEM_APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [{ name: 'isolated-feedback-backend', setup(builder) {
    builder.onResolve({ filter: /(^|\/)supabaseClient(?:\.ts)?$/ }, () => ({ path: 'supabase-preview', namespace: 'feedback-preview' }));
    builder.onLoad({ filter: /.*/, namespace: 'feedback-preview' }, () => ({ contents: `
      const query = new Proxy(function(){}, { get: (_, key) => key === 'then' ? (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject) : query, apply: () => query });
      export const supabase = query; export const supabasePublic = query; export const supabaseSignUpClient = query;
      export const SUPABASE_URL = 'https://isolated-preview.invalid'; export const SUPABASE_ANON_KEY = 'isolated-preview-only'; export const SUPABASE_AUTH_STORAGE_KEY = 'isolated-preview-auth';
    `, loader: 'js' }));
  } }],
});
console.log('Built isolated feedback preview with a fake backend; this directory is not part of dist.');
