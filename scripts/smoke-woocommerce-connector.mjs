import { setTimeout as delay } from 'node:timers/promises';

const endpoint = 'https://api.tazesystem.ir/functions/v1/external-connectors';
for (let attempt = 1; attempt <= 5; attempt += 1) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 400 && data.error === 'invalid_org') {
      console.log('WooCommerce Edge Function booted and rejected a missing organization as expected.');
      process.exit(0);
    }
    console.error(`WooCommerce function health check returned HTTP ${response.status}.`);
  } catch (error) {
    console.error(`WooCommerce function health check failed: ${error.cause?.code || error.name}.`);
  }
  if (attempt < 5) await delay(3000);
}
process.exitCode = 1;
