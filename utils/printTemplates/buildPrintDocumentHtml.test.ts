import { afterEach, describe, expect, it, vi } from 'vitest';
import { materializeNativePrintMarginImages } from './buildPrintDocumentHtml';

describe('materializeNativePrintMarginImages', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('embeds public images used by the isolated header and footer documents', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await materializeNativePrintMarginImages(`
      <template id="kalamapp-gotenberg-header"><!doctype html><html lang="fa"><head><meta charset="utf-8" /></head><body><img src="https://assets.example.test/company-logo.png" alt="لوگو" /></body></html></template>
      <template id="kalamapp-gotenberg-footer"><!doctype html><html lang="fa"><head><meta charset="utf-8" /></head><body><img src="https://assets.example.test/company-logo.png" alt="لوگو" /></body></html></template>
    `, 'https://app.example.test');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toContain('<!doctype html><html lang="fa"><head>');
    expect(result).toContain('src="data:image/png;base64,iVBORw=="');
    expect(result).not.toContain('src="https://assets.example.test/company-logo.png"');
  });
});
