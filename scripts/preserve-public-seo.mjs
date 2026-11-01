import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Keep published content during a temporary CMS outage, using this release's assets.
const assetTags = /<script\b[^>]*\bsrc=["']\/assets\/[^"']+["'][^>]*>[\s\S]*?<\/script>|<link\b[^>]*\bhref=["']\/assets\/[^"']+["'][^>]*>/gi;

export function preservePublicSeo(previousSeoDir, distDir) {
  const state = JSON.parse(fs.readFileSync(path.join(distDir, 'seo-generation.json'), 'utf8'));
  if (state.dynamicComplete === true) return 0;
  const template = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  const assets = template.match(assetTags) || [];
  if (!assets.length) throw new Error('Current release asset tags are missing.');
  let preserved = 0;
  for (const section of ['blog', 'learn']) {
    const source = path.join(previousSeoDir, section);
    if (!fs.existsSync(source)) continue;
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
      const destination = path.join(distDir, 'seo-pages', section, entry.name);
      if (fs.existsSync(destination)) continue;
      const previousHtml = fs.readFileSync(path.join(source, entry.name), 'utf8');
      if (!previousHtml.includes('data-seo-fallback="true"') || !previousHtml.includes('</head>')) throw new Error('Invalid previous public SEO page.');
      const html = previousHtml.replace(assetTags, '').replace('</head>', `${assets.join('\n')}\n</head>`);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, html, 'utf8');
      preserved += 1;
    }
  }
  if (!preserved && Number(state.dynamicCount || 0) === 0) throw new Error('CMS unavailable and no previous public SEO pages can be recovered.');
  return preserved;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(`Preserved ${preservePublicSeo(process.argv[2], process.argv[3])} public SEO pages with current release assets.`);
}
