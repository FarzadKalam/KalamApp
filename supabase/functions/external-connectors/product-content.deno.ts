import { createClient } from 'npm:@supabase/supabase-js@2.49.8';
import { withWooProductLease } from './product-content.ts';
import { normalizeWooProductDescription } from './product-content-html.ts';

Deno.test('preserves supported WooCommerce formatting across a safe round trip', () => {
  const app = normalizeWooProductDescription(
    '<p style="text-align:center;position:fixed"><b>متن</b><a href="https://example.com/?a=1&b=2">پیوند</a></p>' +
    '<script>discard()</script><a href="&#106;avascript:discard()">عنوان پیوند</a>',
  );
  if (app !== normalizeWooProductDescription(app, true) || !app.includes('text-align:center') ||
    !app.includes('<strong>متن</strong>') || !app.includes('https://example.com/?a=1&amp;b=2') ||
    /position|script|discard\(\)/.test(app)) throw new Error('Unexpected WooCommerce HTML round trip');
  if (normalizeWooProductDescription('first\nsecond') !== '<p>first<br />second</p>' ||
    normalizeWooProductDescription('<p>&nbsp;<br></p>', true) !== '') throw new Error('Unexpected legacy text normalization');
});

Deno.test('clears a WooCommerce product lease without reusing its acquire filters', async () => {
  const requests: Array<{ url: URL; operation: string | null }> = [];
  const client = createClient('https://fixture.invalid', 'fixture-public-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        const body = JSON.parse(String(init?.body || '{}'));
        requests.push({ url, operation: body.product_content_operation });
        return Response.json({ product_content_sync: null });
      },
    },
  });

  for (const shouldFail of [false, true]) {
    const observedFailure = await withWooProductLease(client, 'org', 'link', async () => {
      if (shouldFail) throw new Error('fixture write failed');
      return false;
    }).catch((error) => {
      if (error.message !== 'fixture write failed') throw error;
      return true;
    });
    if (observedFailure !== shouldFail) throw new Error('Lease wrapper changed the operation outcome');
    const [acquire, release] = requests.splice(0);
    if (!acquire.url.searchParams.has('or') || !acquire.operation) throw new Error('Missing acquire guard');
    if (release.url.searchParams.has('or') || release.operation !== null ||
      release.url.searchParams.get('product_content_operation') !== `eq.${acquire.operation}`) {
      throw new Error('Lease release must only match the token for the acquired lease');
    }
  }
});
