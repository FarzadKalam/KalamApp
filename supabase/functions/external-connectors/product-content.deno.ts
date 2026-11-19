import { createClient } from 'npm:@supabase/supabase-js@2.49.8';
import { withWooProductLease } from './product-content.ts';

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
